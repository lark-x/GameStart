import {
  createConversation as createConversationDomain,
  createMessage as createMessageDomain,
  switchActorCharacter as applyActorCharacterSwitch,
  CharacterRole,
} from "../../../../packages/domain/src/index.ts";
import type { HandlerContext } from "../context.ts";
import { trustedActor } from "../context.ts";
import { ApiError, jsonResponse, createSseResponse } from "../helpers.ts";
import { toConversationDto, toMessageDto, toSessionDto } from "../mappers.ts";
import {
  parseCreateConversationRequest,
  parseSendMessageRequest,
  parseSwitchRequest,
} from "../parsers.ts";
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
  type RetryAutomaticReplyState,
} from "../auto-reply.ts";
import { previewMessage } from "../../../../packages/database/src/interaction-log.ts";
import { requestConversationImage as requestConversationImageUseCase, requireConversationImageStore } from "../use-cases/request-conversation-image.ts";

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

async function scheduleAutomaticReply(
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

async function appendLog(ctx: HandlerContext, input: Omit<import("../../../../packages/contracts/src/index.ts").InteractionLogDto, "id" | "createdAt">): Promise<void> {
  try { await ctx.logging.append(input); } catch { /* logging is best effort */ }
}

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleConversations(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  correlationId: string,
): Promise<Response | undefined> {
  const store = ctx.store;

  // --- Create Conversation ---
  if (request.method === "POST" && url.pathname === "/v1/conversations") {
    const input = parseCreateConversationRequest(await parseBody(request));
    const actor = trustedActor(ctx, request);
    if (ctx.requireTrustedActor && actor !== undefined && !input.memberCharacterIds.includes(actor)) {
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
      return jsonResponse({ data: toConversationDto(aggregate) });
    } catch (error) {
      if (error instanceof TypeError && error.message.startsWith("Duplicate")) throw new ApiError(409, "CONFLICT", error.message);
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  // --- List Conversations ---
  if (url.pathname === "/v1/conversations" && request.method === "GET") {
    const characterId = url.searchParams.get("characterId");
    if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
    trustedActor(ctx, request, characterId);
    const chatStore = requireChatStore(store);
    if (!(await chatStore.characters.getById(characterId))) throw new ApiError(404, "NOT_FOUND", "Character not found");
    return jsonResponse({ data: (await chatStore.conversations.listByCharacter(characterId)).map(toConversationDto) });
  }

  // --- Retry Auto Reply ---
  const retryReplyPath = /^\/v1\/conversations\/([^/]+)\/auto-reply\/retry$/.exec(url.pathname);
  if (retryReplyPath) {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const body = await parseBody(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
    const b = body as Record<string, unknown>;
    const allowedKeys = new Set(["readerCharacterId", "sourceMessageId"]);
    if (Object.keys(b).some((k) => !allowedKeys.has(k))) throw new ApiError(400, "BAD_REQUEST", "Request body contains unknown fields");
    const readerCharacterId = typeof b.readerCharacterId === "string" && b.readerCharacterId.trim().length > 0 ? b.readerCharacterId : (() => { throw new ApiError(400, "BAD_REQUEST", "readerCharacterId must be a non-empty string"); })();
    const sourceMessageId = b.sourceMessageId === undefined ? undefined : (typeof b.sourceMessageId === "string" && b.sourceMessageId.trim().length > 0 ? b.sourceMessageId : (() => { throw new ApiError(400, "BAD_REQUEST", "sourceMessageId must be a non-empty string"); })());
    trustedActor(ctx, request, readerCharacterId);
    const conversationId = decodeURIComponent(retryReplyPath[1] ?? "");
    const trace: AutomaticReplyTrace = {
      correlationId, conversationId, actorId: readerCharacterId,
      ...(request.headers.get("x-request-id") === null ? {} : { requestId: request.headers.get("x-request-id")! }),
    };
    const chatStore = requireChatStore(store);
    const messages = await chatStore.messages.listByConversation(conversationId);
    const selected = sourceMessageId ?? [...messages].reverse().find((m) => m.authorCharacterId === readerCharacterId)?.id;
    if (!selected) throw new ApiError(409, "CONFLICT", "Conversation has no USER message to retry");
    const scheduled = await scheduleAutomaticReply(ctx, conversationId, readerCharacterId, selected, trace, true);
    if (scheduled.state.status !== "QUEUED" || !scheduled.completion) return jsonResponse({ data: scheduled.state });
    try {
      const reply = await scheduled.completion;
      return jsonResponse({ data: { status: "COMPLETED", correlationId: trace.correlationId, sourceMessageId: selected, messageId: reply.message.id } });
    } catch {
      return jsonResponse({ data: { status: "FAILED", correlationId: trace.correlationId, sourceMessageId: selected, retryable: true } });
    }
  }

  // --- Messages ---
  const messagePath = /^\/v1\/conversations\/([^/]+)\/messages$/.exec(url.pathname);
  if (messagePath) {
    const conversationId = decodeURIComponent(messagePath[1] ?? "");
    const chatStore = requireChatStore(store);
    if (request.method === "GET") {
      const characterId = url.searchParams.get("characterId");
      if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
      trustedActor(ctx, request, characterId);
      const conversation = await chatStore.conversations.getById(conversationId);
      if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
      const member = conversation.members.some((c) => c.characterId === characterId && c.leftAt === undefined);
      if (!member) throw new ApiError(403, "FORBIDDEN", "Character is not an active member");
      return jsonResponse({ data: (await chatStore.messages.listByConversation(conversationId)).map(toMessageDto) });
    }
    if (request.method === "POST") {
      const input = parseSendMessageRequest(await parseBody(request));
      const actor = trustedActor(ctx, request, input.authorCharacterId);
      if (ctx.requireTrustedActor && actor !== undefined && input.authorCharacterId === undefined) {
        throw new ApiError(403, "FORBIDDEN", "Public API cannot create system messages");
      }
      const conversation = await chatStore.conversations.getById(conversationId);
      if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
      const author = input.authorCharacterId === undefined ? undefined : await chatStore.characters.getById(input.authorCharacterId);
      if (input.authorCharacterId !== undefined && !author) throw new ApiError(404, "NOT_FOUND", "Author character not found");
      const trace: AutomaticReplyTrace = {
        correlationId, conversationId,
        ...(request.headers.get("x-request-id") === null ? {} : { requestId: request.headers.get("x-request-id")! }),
        ...(input.authorCharacterId === undefined ? {} : { actorId: input.authorCharacterId }),
      };
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
          ...(input.authorCharacterId === undefined ? {} : { actorId: input.authorCharacterId }),
          entityType: "message", entityId: result.message.id,
          ...(previewMessage(result.message.text) === undefined ? {} : { message: previewMessage(result.message.text)! }),
        });
        const scheduled = await scheduleAutomaticReply(ctx, conversationId, input.authorCharacterId ?? "", result.message.id, trace, false);
        return jsonResponse({ data: { message: toMessageDto(result.message), inserted: result.inserted, autoReply: scheduled.state } });
      } catch (error) {
        if (error instanceof TypeError && error.message.includes("idempotency")) throw new ApiError(409, "CONFLICT", error.message);
        if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  // --- Stream ---
  const streamPath = /^\/v1\/conversations\/([^/]+)\/stream$/.exec(url.pathname);
  if (streamPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const characterId = url.searchParams.get("characterId");
    if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
    trustedActor(ctx, request, characterId);
    if (!ctx.provider) throw new ApiError(501, "NOT_IMPLEMENTED", "Chat provider is not configured");
    try {
      const orchestrator = new ConversationOrchestrator(ctx.store, ctx.provider, {
        ...ctx.conversationOptions,
        afterReplySaved: async (context: ConversationReplyContext) => {
          if (!context.reply.inserted || context.conversation.conversation.type !== "PRIVATE") return;
          const settings = ctx.store.comfyUiSettings === undefined ? undefined : await ctx.store.comfyUiSettings.get();
          if (!settings?.autoImageIntentEnabled || !settings.defaultWorkflowVersion) return;
          const userContent = context.latestUserMessage?.text;
          const prompt = promptForExplicitChatImageIntent(userContent, context.reply.message.text ?? "");
          if (!prompt) return;
          const userId = context.latestUserMessage?.authorCharacterId;
          if (!userId || userId === context.ai.id) return;
          try {
            const imgStore = requireConversationImageStore(ctx.store);
            await requestConversationImageUseCase(imgStore, context.conversation.conversation.id, {
              actorCharacterId: context.ai.id,
              recipientCharacterId: userId,
              prompt,
              workflowVersion: settings.defaultWorkflowVersion,
              createdAt: context.reply.message.createdAt,
              idempotencyKey: `auto-image:${context.reply.message.id}`,
            });
          } catch {
            // auto-image is best-effort; do not fail the stream
          }
        },
      });
      return createSseResponse(orchestrator.streamReply(decodeURIComponent(streamPath[1] ?? ""), characterId));
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  // --- Actor Session Switch ---
  if (request.method === "POST" && url.pathname === "/v1/actor-sessions/switch") {
    const input = parseSwitchRequest(await parseBody(request));
    const actor = trustedActor(ctx, request);
    if (ctx.requireTrustedActor) {
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
      return jsonResponse({ data: toSessionDto(switched) });
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  return undefined;
}
