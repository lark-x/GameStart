import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";

import {
  prepareV2Prompt,
  type PreparedPrompt,
  type PromptContext,
  toV2ChatMessageContext,
  toV2MemoryContext,
} from "@living-network/ai/prompt-engine";
import type {
  V2ChatConversationDto,
  V2ChatMediaDto,
  V2ChatMessageDto,
  V2ChatMessagePageResponse,
  V2CharacterId,
  V2ConversationId,
  V2ConversationListResponse,
  V2ConversationSummaryDto,
  V2ChatMessageListResponse,
  V2MemoryDto,
  V2CreateInstantStoryRequest,
  V2CreateInstantStoryResponse,
  V2GenerateChatReplyRequest,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2MediaId,
  V2MessageId,
  V2SendChatMessageRequest,
  V2SendChatMessageResponse,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import {
  assertV2PersonaText,
  createV2CanonCharacter,
  createV2CanonWorld,
  createV2ChatConversation,
  createV2ChatMaintenanceJob,
  createV2ChatMedia,
  createV2ChatMessage,
  type V2CanonCharacter,
  type V2CanonWorld,
  type V2ChatConversation,
  type V2ChatMessage,
  type V2ConversationSummary,
  type V2Memory,
} from "@living-network/domain/v2";
import type {
  V2ChatUnitOfWork,
  V2MemoryRepository,
} from "@living-network/ports/v2";

import { V2HttpError } from "../core/errors.ts";

export interface V2PreparedChatReply {
  readonly conversationId: V2ConversationId;
  readonly assistantMessageId: V2MessageId;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly existingMessage?: V2ChatMessageDto;
  readonly prompt?: PreparedPrompt;
  readonly task: PromptContext["task"];
}

export interface V2ChatUseCases {
  createInstantStory(input: V2CreateInstantStoryRequest): Promise<V2CreateInstantStoryResponse>;
  listConversations(): Promise<V2ConversationListResponse>;
  getConversation(conversationId: V2ConversationId): Promise<V2ChatConversationDto>;
  listMessages(
    conversationId: V2ConversationId,
    query?: { readonly beforeMessageId?: V2MessageId; readonly limit?: number },
  ): Promise<V2ChatMessagePageResponse>;
  sendMessage(conversationId: V2ConversationId, input: V2SendChatMessageRequest): Promise<V2SendChatMessageResponse>;
  prepareReply(conversationId: V2ConversationId, input: V2GenerateChatReplyRequest): Promise<V2PreparedChatReply>;
  saveReply(input: {
    readonly conversationId: V2ConversationId;
    readonly messageId: V2MessageId;
    readonly idempotencyKey: V2IdempotencyKey;
    readonly text: string;
    readonly status: "completed" | "failed" | "interrupted";
    readonly replyToMessageId?: V2MessageId;
  }): Promise<V2ChatMessageDto>;
  createMedia(input: {
    readonly mediaId: V2MediaId;
    readonly contentHash: string;
    readonly mediaRef: string;
    readonly mimeType: string;
    readonly byteSize: number;
    readonly width?: number;
    readonly height?: number;
    readonly createdAt: string;
  }): Promise<V2ChatMediaDto>;
  listMemories(conversationId: V2ConversationId): Promise<readonly V2MemoryDto[]>;
  getSummary(conversationId: V2ConversationId): Promise<V2ConversationSummaryDto | undefined>;
}

const DEFAULT_TOKEN_BUDGET = 4096;

export function createV2ChatUseCases(unitOfWork: V2ChatUnitOfWork): V2ChatUseCases {
  return {
    createInstantStory: (input) => createInstantStory(unitOfWork, input),
    listConversations: async () => unitOfWork.withChatTransaction(async ({ conversations }) => ({
      conversations: (await conversations.list()).map(toConversationDto),
    })),
    getConversation: async (conversationId) => unitOfWork.withChatTransaction(async ({ conversations }) => {
      const conversation = await requireConversation(conversations, conversationId);
      return toConversationDto(conversation);
    }),
    listMessages: async (conversationId, query) => unitOfWork.withChatTransaction(async ({ conversations, messages }) => {
      await requireConversation(conversations, conversationId);
      const limit = Math.min(Math.max(query?.limit ?? 50, 1), 200);
      const beforeMessageId = query?.beforeMessageId;
      const rows = beforeMessageId === undefined
        ? await messages.listRecentByConversation(conversationId, limit + 1)
        : await messages.listBefore(conversationId, beforeMessageId, limit + 1);
      const hasMore = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      return {
        messages: pageRows.map(toMessageDto),
        hasMore,
        ...(pageRows.length === 0 ? {} : { nextBeforeMessageId: pageRows[0]!.messageId as V2MessageId }),
      };
    }),
    sendMessage: (conversationId, input) => sendMessage(unitOfWork, conversationId, input),
    prepareReply: (conversationId, input) => prepareReply(unitOfWork, conversationId, input),
    saveReply: (input) => saveReply(unitOfWork, input),
    createMedia: (input) => createMedia(unitOfWork, input),
    listMemories: async (conversationId) => unitOfWork.withChatTransaction(async ({ conversations, memories }) => {
      const conversation = await requireConversation(conversations, conversationId);
      return (await memories.listActiveByStoryWorld(conversation.storyWorldId as V2StoryWorldId)).map(toMemoryDto);
    }),
    getSummary: async (conversationId) => unitOfWork.withChatTransaction(async ({ conversations, summaries }) => {
      await requireConversation(conversations, conversationId);
      const summary = await summaries.get(conversationId);
      return summary === undefined ? undefined : toSummaryDto(summary);
    }),
  };
}

async function createInstantStory(
  unitOfWork: V2ChatUnitOfWork,
  input: V2CreateInstantStoryRequest,
): Promise<V2CreateInstantStoryResponse> {
  const persona = assertV2PersonaText(input.persona);
  const hash = createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 24);
  const storyWorldId = `world:instant:${hash}` as V2StoryWorldId;
  const characterId = `character:instant:${hash}` as V2CanonCharacter["characterId"];
  const conversationId = `conversation:instant:${hash}` as V2ConversationId;
  const displayName = input.displayName?.trim();
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ persona, displayName: displayName ?? null }))
    .digest("hex");

  return unitOfWork.withChatTransaction(async ({ canon, conversations }) => {
    const mutation = await canon.readMutation<{ readonly conversationId: V2ConversationId }>({
      key: input.idempotencyKey,
      operation: "createInstantStory",
    });
    if (mutation !== undefined && mutation.payloadHash !== payloadHash) {
      throw new V2HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different instant story payload");
    }
    const existingWorld = await canon.getWorld(storyWorldId);
    if (existingWorld !== undefined) {
      const character = await canon.getCharacter({ storyWorldId, characterId: characterId as V2CharacterId });
      const conversation = await conversations.get(conversationId);
      if (character === undefined || conversation === undefined) {
        throw new V2HttpError(409, "IDEMPOTENCY_CONFLICT", "Instant story idempotency key maps to an incomplete story");
      }
      return {
        storyWorld: {
          storyWorldId,
          name: existingWorld.name,
          ...(existingWorld.summary === undefined ? {} : { summary: existingWorld.summary }),
        },
        character: {
          characterId: character.characterId as V2CreateInstantStoryResponse["character"]["characterId"],
          name: character.name,
          personaText: character.personaText ?? persona,
        },
        conversation: toConversationDto(conversation),
      };
    }

    const world = await canon.createWorld(createV2CanonWorld({
      storyWorldId,
      name: displayName ?? "即时故事",
      summary: `由用户人设创建：${persona.slice(0, 240)}`,
    }));
    const character = await canon.createCharacter(createV2CanonCharacter({
      storyWorldId,
      characterId,
      name: displayName ?? "角色",
      summary: "由用户人设创建的 AI 角色",
      personaText: persona,
    }));
    const conversation = await conversations.create(createV2ChatConversation({
      conversationId,
      storyWorldId,
      primaryCharacterId: character.characterId,
      ...(displayName === undefined ? {} : { title: displayName }),
    }));
    await canon.saveMutation({
      key: input.idempotencyKey,
      operation: "createInstantStory",
      payloadHash,
      result: { conversationId },
    });

    void world;
    return {
      storyWorld: {
        storyWorldId,
        name: world.name,
        ...(world.summary === undefined ? {} : { summary: world.summary }),
      },
      character: {
        characterId: character.characterId as V2CreateInstantStoryResponse["character"]["characterId"],
        name: character.name,
        personaText: character.personaText ?? persona,
      },
      conversation: toConversationDto(conversation),
    };
  });
}

async function sendMessage(
  unitOfWork: V2ChatUnitOfWork,
  conversationId: V2ConversationId,
  input: V2SendChatMessageRequest,
): Promise<V2SendChatMessageResponse> {
  const text = input.text?.trim();
  if ((text === undefined || text.length === 0) && (input.attachmentIds?.length ?? 0) === 0) {
    throw new V2HttpError(422, "VALIDATION_FAILED", "Message must have text or at least one attachment");
  }
  return unitOfWork.withChatTransaction(async ({ conversations, messages, media }) => {
    const conversation = await requireConversation(conversations, conversationId);
    const attachmentIds = input.attachmentIds ?? [];
    const existing = await messages.findByIdempotencyKey(conversationId, input.idempotencyKey);
    if (existing !== undefined) {
      const sameText = (existing.text ?? "") === (text ?? "");
      const sameReplyTo = (existing.replyToMessageId ?? undefined) === (input.replyToMessageId ?? undefined);
      const sameAttachments = attachmentIds.length === existing.attachments.length &&
        existing.attachments.every((attachment, index) => attachment.mediaId === attachmentIds[index]);
      if (!sameText || !sameReplyTo || !sameAttachments) {
        throw new V2HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different message payload");
      }
      return { message: toMessageDto(existing) };
    }
    const mediaItems = await media.listByIds(attachmentIds);
    if (mediaItems.length !== attachmentIds.length) {
      throw new V2HttpError(422, "VALIDATION_FAILED", "One or more attachments do not exist");
    }
    const mediaById = new Map(mediaItems.map((item) => [item.mediaId, item]));
    const orderedMediaItems = attachmentIds.map((id) => {
      const item = mediaById.get(id);
      if (item === undefined) throw new V2HttpError(422, "VALIDATION_FAILED", "One or more attachments do not exist");
      return item;
    });
    const attachments = orderedMediaItems.map((item) => ({
      attachmentId: `att:${item.mediaId}`,
      kind: "image" as const,
      mediaId: item.mediaId as V2MediaId,
      mediaRef: item.mediaRef,
      mimeType: item.mimeType,
      ...(item.width === undefined ? {} : { width: item.width }),
      ...(item.height === undefined ? {} : { height: item.height }),
    }));
    const message = createV2ChatMessage({
      messageId: `message:user:${randomUUID()}` as V2MessageId,
      conversationId,
      role: "user",
      ...(text === undefined ? {} : { text }),
      attachments,
      idempotencyKey: input.idempotencyKey,
      ...(input.replyToMessageId === undefined ? {} : { replyToMessageId: input.replyToMessageId }),
    });
    const created = await messages.create(message);
    const createdAt = created.createdAt ?? new Date().toISOString();
    await conversations.touchLastMessage({ conversationId, lastMessageAt: createdAt });
    void conversation;
    return { message: toMessageDto(created) };
  });
}

async function prepareReply(
  unitOfWork: V2ChatUnitOfWork,
  conversationId: V2ConversationId,
  input: V2GenerateChatReplyRequest,
): Promise<V2PreparedChatReply> {
  return unitOfWork.withChatTransaction(async ({ canon, conversations, messages, memories, summaries }) => {
    const conversation = await requireConversation(conversations, conversationId);
    const character = await canon.getCharacter({
      storyWorldId: conversation.storyWorldId as V2StoryWorldId,
      characterId: conversation.primaryCharacterId as V2CharacterId,
    });
    const world = await canon.getWorld(conversation.storyWorldId as V2StoryWorldId);
    const recentMessages = await messages.listRecentByConversation(conversationId, 40);
    const existing = recentMessages.find((message) => message.idempotencyKey === input.idempotencyKey && message.role === "assistant");
    if (existing !== undefined && existing.status === "completed") {
      return {
        conversationId,
        assistantMessageId: existing.messageId as V2MessageId,
        idempotencyKey: input.idempotencyKey,
        existingMessage: toMessageDto(existing),
        task: "chat.reply",
      };
    }

    const currentUser = [...recentMessages].reverse().find((message) => message.role === "user");
    const historyMessages = currentUser === undefined
      ? recentMessages
      : await messages.listBefore(conversationId, currentUser.messageId as V2MessageId, 40);
    const query = currentUser?.text ?? "";
    const memoryRows = query.trim().length > 0
      ? await searchMemories(memories, conversation.storyWorldId as V2StoryWorldId, query)
      : await memories.listActiveByStoryWorld(conversation.storyWorldId as V2StoryWorldId);
    const summary = await summaries.get(conversationId);

    const facts = await canon.listFacts(conversation.storyWorldId as V2StoryWorldId);
    const rules = await canon.listRules(conversation.storyWorldId as V2StoryWorldId);
    const task = currentUser === undefined ? "story.bootstrap" : "chat.reply";

    const context: PromptContext = {
      task,
      tokenBudget: DEFAULT_TOKEN_BUDGET,
      memories: memoryRows.slice(0, 10).map(toV2MemoryContext),
      recentMessages: historyMessages.slice(-24).map(toV2ChatMessageContext),
      ...(character === undefined ? {} : {
        persona: {
          name: character.name,
          personaText: character.personaText ?? "",
        },
      }),
      ...(world === undefined ? {} : {
        world: {
          storyWorldId: world.storyWorldId as V2StoryWorldId,
          name: world.name,
          ...(world.summary === undefined ? {} : { summary: world.summary }),
        },
      }),
      ...(facts.length === 0 && rules.length === 0 ? {} : {
        canon: [
          ...facts.map((fact) => ({ id: fact.factId, kind: "fact" as const, text: fact.text })),
          ...rules.map((rule) => ({ id: rule.ruleId, kind: "rule" as const, text: rule.text })),
        ],
      }),
      ...(summary === undefined ? {} : { sessionSummary: summary.summary }),
      ...(currentUser === undefined ? {} : {
        currentInput: {
          ...(currentUser.text === undefined ? {} : { text: currentUser.text }),
          imageCount: currentUser.attachments.length,
          images: currentUser.attachments.map((attachment) => ({
            mediaId: attachment.mediaId,
            mediaRef: attachment.mediaRef,
            mimeType: attachment.mimeType,
            byteSize: 0,
          })),
        },
      }),
    };

    const prompt = prepareV2Prompt(context);
    const assistantMessageId = stableAssistantMessageId(conversationId, input.idempotencyKey);
    return {
      conversationId,
      assistantMessageId,
      idempotencyKey: input.idempotencyKey,
      prompt,
      task,
    };
  });
}

async function saveReply(
  unitOfWork: V2ChatUnitOfWork,
  input: {
    readonly conversationId: V2ConversationId;
    readonly messageId: V2MessageId;
    readonly idempotencyKey: V2IdempotencyKey;
    readonly text: string;
    readonly status: "completed" | "failed" | "interrupted";
    readonly replyToMessageId?: V2MessageId;
  },
): Promise<V2ChatMessageDto> {
  return unitOfWork.withChatTransaction(async ({ conversations, messages, summaries, maintenanceJobs }) => {
    await requireConversation(conversations, input.conversationId);
    const existing = await messages.get(input.messageId);
    if (existing !== undefined) return toMessageDto(existing);
    const message = createV2ChatMessage({
      messageId: input.messageId,
      conversationId: input.conversationId,
      role: "assistant",
      text: input.text.trim(),
      status: input.status,
      idempotencyKey: input.idempotencyKey,
      ...(input.replyToMessageId === undefined ? {} : { replyToMessageId: input.replyToMessageId }),
    });
    const created = await messages.create(message);
    const createdAt = created.createdAt ?? new Date().toISOString();
    await conversations.touchLastMessage({ conversationId: input.conversationId, lastMessageAt: createdAt });

    if (input.status === "completed") {
      const [userCount, totalCount] = await Promise.all([
        messages.countUserMessagesByConversation(input.conversationId),
        messages.countByConversation(input.conversationId),
      ]);
      const summary = await summaries.get(input.conversationId);
      const coveredCount = summary?.sourceMessageCount ?? 0;
      if (userCount > 0 && userCount % 4 === 0) {
        await maintenanceJobs.create(createV2ChatMaintenanceJob({
          jobId: `job:memory:${randomUUID()}`,
          conversationId: input.conversationId,
          jobType: "memory_extract",
          payload: { coveredMessageId: created.messageId, coveredMessageCount: totalCount },
          dedupeKey: `memory_extract:${input.conversationId}:${created.messageId}`,
        }));
      }
      if (totalCount - coveredCount >= 30) {
        await maintenanceJobs.create(createV2ChatMaintenanceJob({
          jobId: `job:summary:${randomUUID()}`,
          conversationId: input.conversationId,
          jobType: "conversation_summary",
          payload: { coveredMessageId: created.messageId, coveredMessageCount: totalCount },
          dedupeKey: `conversation_summary:${input.conversationId}:${created.messageId}`,
        }));
      }
    }

    return toMessageDto(created);
  });
}

async function createMedia(
  unitOfWork: V2ChatUnitOfWork,
  input: {
    readonly mediaId: V2MediaId;
    readonly contentHash: string;
    readonly mediaRef: string;
    readonly mimeType: string;
    readonly byteSize: number;
    readonly width?: number;
    readonly height?: number;
    readonly createdAt: string;
  },
): Promise<V2ChatMediaDto> {
  return unitOfWork.withChatTransaction(async ({ media }) => {
    const existing = await media.get(input.mediaId);
    if (existing !== undefined) {
      return {
        mediaId: existing.mediaId as V2MediaId,
        contentHash: existing.contentHash,
        mediaRef: existing.mediaRef,
        mimeType: existing.mimeType,
        byteSize: existing.byteSize,
        ...(existing.width === undefined ? {} : { width: existing.width }),
        ...(existing.height === undefined ? {} : { height: existing.height }),
        createdAt: (existing.createdAt ?? input.createdAt) as V2IsoDateTime,
      };
    }
    const created = await media.create(createV2ChatMedia(input));
    return {
      mediaId: created.mediaId as V2MediaId,
      contentHash: created.contentHash,
      mediaRef: created.mediaRef,
      mimeType: created.mimeType,
      byteSize: created.byteSize,
      ...(created.width === undefined ? {} : { width: created.width }),
      ...(created.height === undefined ? {} : { height: created.height }),
      createdAt: (created.createdAt ?? input.createdAt) as V2IsoDateTime,
    };
  });
}

function stableAssistantMessageId(conversationId: V2ConversationId, idempotencyKey: V2IdempotencyKey): V2MessageId {
  const hash = createHash("sha256").update(`${conversationId}\n${idempotencyKey}`).digest("hex").slice(0, 24);
  return `message:assistant:${hash}` as V2MessageId;
}

async function searchMemories(memories: V2MemoryRepository, storyWorldId: V2StoryWorldId, query: string): Promise<readonly V2Memory[]> {
  return memories.searchActive({ storyWorldId, query, limit: 10 });
}

async function requireConversation(
  conversations: { get(conversationId: V2ConversationId): Promise<V2ChatConversation | undefined> },
  conversationId: V2ConversationId,
): Promise<V2ChatConversation> {
  const conversation = await conversations.get(conversationId);
  if (conversation === undefined) {
    throw new V2HttpError(404, "NOT_FOUND", "Conversation not found");
  }
  return conversation;
}

function toConversationDto(conversation: V2ChatConversation): V2ChatConversationDto {
  return {
    conversationId: conversation.conversationId as V2ChatConversationDto["conversationId"],
    storyWorldId: conversation.storyWorldId as V2StoryWorldId,
    primaryCharacterId: conversation.primaryCharacterId as V2ChatConversationDto["primaryCharacterId"],
    ...(conversation.title === undefined ? {} : { title: conversation.title }),
    createdAt: (conversation.createdAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    updatedAt: (conversation.updatedAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    ...(conversation.lastMessageAt === undefined ? {} : { lastMessageAt: conversation.lastMessageAt as V2IsoDateTime }),
  };
}

function toMessageDto(message: V2ChatMessage): V2ChatMessageDto {
  return {
    messageId: message.messageId as V2MessageId,
    conversationId: message.conversationId as V2ConversationId,
    role: message.role,
    ...(message.characterId === undefined ? {} : { characterId: message.characterId as V2CharacterId }),
    ...(message.text === undefined ? {} : { text: message.text }),
    attachments: message.attachments.map((attachment) => ({
      attachmentId: attachment.attachmentId,
      kind: "image",
      mediaId: attachment.mediaId as V2MediaId,
      mediaRef: attachment.mediaRef,
      mimeType: attachment.mimeType,
      ...(attachment.width === undefined ? {} : { width: attachment.width }),
      ...(attachment.height === undefined ? {} : { height: attachment.height }),
    })),
    status: message.status,
    createdAt: (message.createdAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    idempotencyKey: message.idempotencyKey as V2IdempotencyKey,
    ...(message.replyToMessageId === undefined ? {} : { replyToMessageId: message.replyToMessageId as V2MessageId }),
  };
}

function toMemoryDto(memory: V2Memory): V2MemoryDto {
  return {
    memoryId: memory.memoryId as V2MemoryDto["memoryId"],
    storyWorldId: memory.storyWorldId as V2StoryWorldId,
    ...(memory.conversationId === undefined ? {} : { conversationId: memory.conversationId as V2ConversationId }),
    ...(memory.characterId === undefined ? {} : { characterId: memory.characterId as V2CharacterId }),
    kind: memory.kind,
    content: memory.content,
    importance: memory.importance,
    confidence: memory.confidence,
    sourceMessageIds: memory.sourceMessageIds as V2MessageId[],
    status: memory.status,
    ...(memory.supersedesMemoryId === undefined ? {} : { supersedesMemoryId: memory.supersedesMemoryId as NonNullable<V2MemoryDto["supersedesMemoryId"]> }),
    createdAt: (memory.createdAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    updatedAt: (memory.updatedAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    ...(memory.lastAccessedAt === undefined ? {} : { lastAccessedAt: memory.lastAccessedAt as V2IsoDateTime }),
  };
}

function toSummaryDto(summary: V2ConversationSummary): V2ConversationSummaryDto {
  return {
    conversationId: summary.conversationId as V2ConversationId,
    summary: summary.summary,
    coveredUntilMessageId: summary.coveredUntilMessageId as V2MessageId,
    sourceMessageCount: summary.sourceMessageCount,
    updatedAt: (summary.updatedAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    version: summary.version,
  };
}
