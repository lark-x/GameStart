import {
  createConversation as createConversationDomain,
  createMessage as createMessageDomain,
  switchActorCharacter as applyActorCharacterSwitch,
  CharacterRole,
} from "../../../../packages/domain/src/index.ts";
import type { HandlerContext, ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import { toConversationDto, toMessageDto, toSessionDto } from "../mappers.ts";
import { requireChatStore } from "../store-helpers.ts";
import { ConversationOrchestrator } from "../conversation-orchestrator.ts";
import type { ConversationReply, ConversationReplyContext } from "../conversation-orchestrator.ts";
import { promptForExplicitChatImageIntent } from "../auto-image-intent.ts";
import {
  assistantReplyId,
  automaticReplyFlightKey,
  findEligibleAi,
  isEligibleSource,
  type AutomaticReplyState,
  type AutomaticReplyTrace,
} from "../auto-reply.ts";
import { previewMessage } from "../../../../packages/database/src/interaction-log.ts";
import { requestConversationImage as requestConversationImageUseCase, requireConversationImageStore } from "./request-conversation-image.ts";
import type {
  CreateConversationRequest,
  SendMessageRequest,
  ActorSessionSwitchRequest,
  ConversationDetailDto,
  MessageDto,
  ActorSessionDto,
} from "../../../../packages/contracts/src/index.ts";

// --- Shared auto-reply scheduling ---

interface ScheduledAutomaticReply {
  readonly state: AutomaticReplyState;
  readonly completion?: Promise<ConversationReply>;
}

function automaticReplyState(
  ctx: HandlerContext,
  status: AutomaticReplyState["status"],
  trace: AutomaticReplyTrace,
  sourceMessageId: string,
): AutomaticReplyState {
  return { status, correlationId: trace.correlationId, sourceMessageId };
}

async function appendLog(ctx: HandlerContext, input: Omit<import("../../../../packages/contracts/src/index.ts").InteractionLogDto, "id" | "createdAt">): Promise<void> {
  try { await ctx.logging.append(input); } catch { /* logging is best effort */ }
}

export async function scheduleAutomaticReply(
  ctx: HandlerContext,
  conversationId: string,
  readerCharacterId: string,
  sourceMessageId: string,
  trace: AutomaticReplyTrace,
  requireLatest: boolean,
): Promise<ScheduledAutomaticReply> {
  const store = requireChatStore(ctx.store);
  const conversation = await store.conversations.getById(conversationId);
  if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");

  const characters = await Promise.all(
    conversation.members
      .filter((m) => m.leftAt === undefined)
      .map((m) => store.characters.getById(m.characterId)),
  );
  const ai = findEligibleAi(conversation, characters, readerCharacterId);
  const messages = await store.messages.listByConversation(conversationId);
  const source = messages.find((m) => m.id === sourceMessageId);
  if (!ai || !isEligibleSource(source, readerCharacterId) || !ctx.provider) {
    return { state: automaticReplyState(ctx, "NOT_APPLICABLE", trace, sourceMessageId) };
  }

  const userIds = new Set(
    characters.filter((c) => c?.role === CharacterRole.USER).map((c) => c!.id),
  );
  const latestUserMessage = [...messages].reverse().find((m) => m.authorCharacterId !== undefined && userIds.has(m.authorCharacterId));
  if (requireLatest && latestUserMessage?.id !== sourceMessageId) {
    throw new ApiError(409, "CONFLICT", "sourceMessageId is not the latest USER message");
  }

  const deterministicId = assistantReplyId(conversationId, sourceMessageId);
  if (messages.some((m) => m.id === deterministicId)) {
    return { state: automaticReplyState(ctx, "ALREADY_EXISTS", trace, sourceMessageId) };
  }

  const flightKey = automaticReplyFlightKey(conversationId, sourceMessageId);
  const active = ctx.replyFlights.get(flightKey);
  if (active) {
    return { state: automaticReplyState(ctx, "QUEUED", trace, sourceMessageId), completion: active };
  }

  const logBase = {
    source: "API" as const,
    category: "CHAT" as const,
    correlationId: trace.correlationId,
    ...(trace.requestId === undefined ? {} : { requestId: trace.requestId }),
    conversationId,
    actorId: readerCharacterId,
    entityType: "message",
    entityId: sourceMessageId,
  };
  void appendLog(ctx, { ...logBase, level: "INFO", action: "auto_reply.queued", outcome: "QUEUED" });

  let completion!: Promise<ConversationReply>;
  completion = (async (): Promise<ConversationReply> => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await appendLog(ctx, { ...logBase, level: "INFO", action: "auto_reply.started", outcome: "STARTED" });
    try {
      const currentMessages = await store.messages.listByConversation(conversationId);
      const currentLatestUser = [...currentMessages].reverse().find((m) => m.authorCharacterId !== undefined && userIds.has(m.authorCharacterId));
      if (currentLatestUser?.id !== sourceMessageId) {
        throw new ApiError(409, "CONFLICT", "A newer USER message superseded this automatic reply");
      }
      const reply = await new ConversationOrchestrator(ctx.store, ctx.provider!, ctx.conversationOptions).completeReply(conversationId, readerCharacterId, trace);
      await appendLog(ctx, {
        ...logBase, level: "INFO", action: "auto_reply.completed",
        outcome: reply.inserted ? "SUCCESS" : "REPLAY",
        ...(previewMessage(reply.message.text) === undefined ? {} : { message: previewMessage(reply.message.text)! }),
        details: { replyMessageId: reply.message.id },
      });
      return reply;
    } catch (error) {
      await appendLog(ctx, {
        ...logBase, level: "ERROR", action: "auto_reply.failed", outcome: "FAILURE",
        ...(previewMessage(error instanceof Error ? error.message : "Automatic reply failed") === undefined ? {} : { message: previewMessage(error instanceof Error ? error.message : "Automatic reply failed")! }),
        details: { retryable: true },
      });
      throw error;
    } finally {
      if (ctx.replyFlights.get(flightKey) === completion) ctx.replyFlights.delete(flightKey);
    }
  })();
  ctx.replyFlights.set(flightKey, completion);
  void completion.catch(() => undefined);
  return { state: automaticReplyState(ctx, "QUEUED", trace, sourceMessageId), completion };
}

// --- Use-case functions ---

export async function listConversations(store: ApiStore, characterId: string): Promise<ConversationDetailDto[]> {
  const chatStore = requireChatStore(store);
  if (!(await chatStore.characters.getById(characterId))) throw new ApiError(404, "NOT_FOUND", "Character not found");
  return (await chatStore.conversations.listByCharacter(characterId)).map(toConversationDto);
}

export async function createConversation(store: ApiStore, input: CreateConversationRequest, actor?: string, requireTrustedActor = false): Promise<ConversationDetailDto> {
  if (requireTrustedActor && actor !== undefined && !input.memberCharacterIds.includes(actor)) {
    throw new ApiError(403, "FORBIDDEN", "Trusted actor must be a conversation member");
  }
  const chatStore = requireChatStore(store);
  const storyWorld = await chatStore.storyWorlds.getById(input.storyWorldId);
  if (!storyWorld) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  const members = await Promise.all(
    input.memberCharacterIds.map(async (id) => {
      const character = await chatStore.characters.getById(id);
      if (!character) throw new ApiError(404, "NOT_FOUND", `Character not found: ${id}`);
      return character;
    }),
  );
  try {
    const aggregate = createConversationDomain({ id: input.id, storyWorld, type: input.type, createdAt: input.createdAt, members, ...(input.title === undefined ? {} : { title: input.title }) });
    await chatStore.conversations.save(aggregate);
    return toConversationDto(aggregate);
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith("Duplicate")) throw new ApiError(409, "CONFLICT", error.message);
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function sendMessage(
  ctx: HandlerContext,
  conversationId: string,
  authorCharacterId: string | undefined,
  input: SendMessageRequest,
  trace: AutomaticReplyTrace,
): Promise<{ message: MessageDto; inserted: boolean; autoReply: AutomaticReplyState }> {
  const chatStore = requireChatStore(ctx.store);
  const conversation = await chatStore.conversations.getById(conversationId);
  if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
  const author = authorCharacterId === undefined ? undefined : await chatStore.characters.getById(authorCharacterId);
  if (authorCharacterId !== undefined && !author) throw new ApiError(404, "NOT_FOUND", "Author character not found");
  try {
    const message = createMessageDomain({
      id: input.id, conversation, kind: input.kind, createdAt: input.createdAt, idempotencyKey: input.idempotencyKey,
      ...(author === undefined ? {} : { author }),
      ...(input.text === undefined ? {} : { text: input.text }),
      ...(input.mediaRef === undefined ? {} : { mediaRef: input.mediaRef }),
      ...(input.stickerId === undefined ? {} : { stickerId: input.stickerId }),
    });
    const result = await chatStore.messages.save(message);
    await appendLog(ctx, {
      level: "INFO", source: "API", category: "CHAT", action: "message.save",
      outcome: result.inserted ? "SUCCESS" : "REPLAY",
      correlationId: trace.correlationId,
      ...(trace.requestId === undefined ? {} : { requestId: trace.requestId }),
      conversationId,
      ...(authorCharacterId === undefined ? {} : { actorId: authorCharacterId }),
      entityType: "message", entityId: result.message.id,
      ...(previewMessage(result.message.text) === undefined ? {} : { message: previewMessage(result.message.text)! }),
    });
    const scheduled = await scheduleAutomaticReply(ctx, conversationId, authorCharacterId ?? "", result.message.id, trace, false);
    return { message: toMessageDto(result.message), inserted: result.inserted, autoReply: scheduled.state };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("idempotency")) throw new ApiError(409, "CONFLICT", error.message);
    if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function listMessages(store: ApiStore, conversationId: string, characterId: string): Promise<MessageDto[]> {
  const chatStore = requireChatStore(store);
  const conversation = await chatStore.conversations.getById(conversationId);
  if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
  const member = conversation.members.some((c) => c.characterId === characterId && c.leftAt === undefined);
  if (!member) throw new ApiError(403, "FORBIDDEN", "Character is not an active member");
  return (await chatStore.messages.listByConversation(conversationId)).map(toMessageDto);
}

export async function switchActorCharacter(store: ApiStore, input: ActorSessionSwitchRequest, actor?: string, requireTrustedActor = false): Promise<ActorSessionDto> {
  if (requireTrustedActor) {
    const session = await store.actorSessions.getById(input.actorSessionId);
    if (!session) throw new ApiError(404, "NOT_FOUND", "Actor session not found");
    if (actor !== session.userCharacterId) throw new ApiError(403, "FORBIDDEN", "Trusted actor does not own this session");
  }
  const session = await store.actorSessions.getById(input.actorSessionId);
  if (!session) throw new ApiError(404, "NOT_FOUND", "Actor session not found");
  const nextCharacter = await store.characters.getById(input.nextCharacterId);
  if (!nextCharacter) throw new ApiError(404, "NOT_FOUND", "Character not found");
  try {
    const switched = applyActorCharacterSwitch(session, nextCharacter);
    await store.actorSessions.save(switched);
    return toSessionDto(switched);
  } catch (error) {
    if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function retryAutomaticReply(
  ctx: HandlerContext,
  conversationId: string,
  readerCharacterId: string,
  sourceMessageId: string | undefined,
  trace: AutomaticReplyTrace,
): Promise<AutomaticReplyState | { status: "COMPLETED"; correlationId: string; sourceMessageId: string; messageId: string } | { status: "FAILED"; correlationId: string; sourceMessageId: string; retryable: true }> {
  const chatStore = requireChatStore(ctx.store);
  const messages = await chatStore.messages.listByConversation(conversationId);
  const selected = sourceMessageId ?? [...messages].reverse().find((m) => m.authorCharacterId === readerCharacterId)?.id;
  if (!selected) throw new ApiError(409, "CONFLICT", "Conversation has no USER message to retry");
  const scheduled = await scheduleAutomaticReply(ctx, conversationId, readerCharacterId, selected, trace, true);
  if (scheduled.state.status !== "QUEUED" || !scheduled.completion) return scheduled.state;
  try {
    const reply = await scheduled.completion;
    return { status: "COMPLETED", correlationId: trace.correlationId, sourceMessageId: selected, messageId: reply.message.id };
  } catch {
    return { status: "FAILED", correlationId: trace.correlationId, sourceMessageId: selected, retryable: true };
  }
}
