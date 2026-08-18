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
  V2ChatDiagnosticsResponse,
  V2ChatMediaDto,
  V2ChatMessageDto,
  V2ChatMessagePageResponse,
  V2CharacterId,
  V2ConversationId,
  V2ConversationListResponse,
  V2ConversationSummaryPayload,
  V2ChatMessageListResponse,
  V2CreateInstantStoryRequest,
  V2CreateInstantStoryResponse,
  V2GenerateChatReplyRequest,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2MaintenanceJobId,
  V2MediaId,
  V2MemoryExtractPayload,
  V2MemoryId,
  V2MessageId,
  V2SendChatMessageRequest,
  V2SendChatMessageResponse,
  V2StoryAnalyzePayload,
  V2StoryWorldId,
  V2TriggerStoryAnalyzeResponse,
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

export interface V2PromptRuntimeBudget {
  readonly contextWindow?: number;
  readonly maxTokens?: number;
  readonly safetyReserve?: number;
  readonly inputModalities?: readonly string[];
}

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
  prepareReply(
    conversationId: V2ConversationId,
    input: V2GenerateChatReplyRequest,
    runtimeBudget?: V2PromptRuntimeBudget,
  ): Promise<V2PreparedChatReply>;
  getLatestDiagnostics?(conversationId: V2ConversationId): Promise<V2ChatDiagnosticsResponse>;
  triggerStoryAnalyze?(
    conversationId: V2ConversationId,
    input: { readonly idempotencyKey: V2IdempotencyKey },
  ): Promise<V2TriggerStoryAnalyzeResponse>;
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
      const pageRows = hasMore ? rows.slice(rows.length - limit) : rows;
      return {
        messages: pageRows.map(toMessageDto),
        hasMore,
        ...(pageRows.length === 0 ? {} : { nextBeforeMessageId: pageRows[0]!.messageId as V2MessageId }),
      };
    }),
    sendMessage: (conversationId, input) => sendMessage(unitOfWork, conversationId, input),
    prepareReply: (conversationId, input, runtimeBudget) => prepareReply(unitOfWork, conversationId, input, runtimeBudget),
    saveReply: (input) => saveReply(unitOfWork, input),
    getLatestDiagnostics: async (conversationId) => unitOfWork.withChatTransaction(async ({ conversations, memories, summaries, messages }) => {
      await requireConversation(conversations, conversationId);
      const summary = await summaries.get(conversationId);
      const allMemories = await memories.listByConversation(conversationId);
      const activeMemories = allMemories.filter((m) => m.status === "active");
      const recent = await messages.listRecentByConversation(conversationId, 20);
      const recentImages = recent.reduce((sum, m) => sum + m.attachments.length, 0);
      return {
        templateId: "chat:roleplay:v1",
        inputBudget: DEFAULT_TOKEN_BUDGET,
        selectedMemoryIds: activeMemories.map((m) => m.memoryId as V2MemoryId),
        ...(summary?.version === undefined ? {} : { summaryVersion: summary.version }),
        recentCount: recent.length,
        imageCount: recentImages,
      };
    }),
    triggerStoryAnalyze: async (conversationId) => unitOfWork.withChatTransaction(async ({ conversations, maintenanceJobs, messages }) => {
      const conversation = await requireConversation(conversations, conversationId);
      const allMessages = await messages.listByConversation(conversationId, 100);
      const sourceMessageIds = allMessages.map((m) => m.messageId as V2MessageId);
      const jobId = `job:maint:${randomUUID()}` as V2MaintenanceJobId;
      const fromMessageId = sourceMessageIds[0];
      const toMessageId = sourceMessageIds[sourceMessageIds.length - 1];
      const payload: V2StoryAnalyzePayload = {
        conversationId,
        storyWorldId: conversation.storyWorldId as any,
        characterId: conversation.primaryCharacterId as any,
        sourceMessageIds,
        ...(fromMessageId === undefined ? {} : { fromMessageId }),
        ...(toMessageId === undefined ? {} : { toMessageId }),
      };
      await maintenanceJobs.enqueue(
        createV2ChatMaintenanceJob({
          jobId,
          conversationId,
          jobType: "story_analyze",
          status: "pending",
          payload,
          attempts: 0,
          maxAttempts: 3,
          availableAt: new Date().toISOString(),
        }),
      );
      return { jobId, conversationId };
    }),
    createMedia: (input) => createMedia(unitOfWork, input),
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
  runtimeBudget?: V2PromptRuntimeBudget,
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
    if (currentUser !== undefined && currentUser.attachments.length > 0) {
      const allowedModalities = runtimeBudget?.inputModalities ?? ["text"];
      if (!allowedModalities.includes("image")) {
        throw new V2HttpError(400, "VISION_NOT_SUPPORTED", "The configured model does not support image input modalities");
      }
    }
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
      tokenBudget: runtimeBudget?.contextWindow ?? DEFAULT_TOKEN_BUDGET,
      ...(runtimeBudget?.contextWindow !== undefined ? { contextWindow: runtimeBudget.contextWindow } : {}),
      ...(runtimeBudget?.maxTokens !== undefined ? { outputReserve: runtimeBudget.maxTokens } : {}),
      ...(runtimeBudget?.safetyReserve !== undefined ? { safetyReserve: runtimeBudget.safetyReserve } : {}),
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
  return unitOfWork.withChatTransaction(async ({ conversations, messages, maintenanceJobs, summaries }) => {
    const conversation = await requireConversation(conversations, input.conversationId);
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
      const recentMessages = await messages.listRecentByConversation(input.conversationId, 10);
      const sourceMessageIds = recentMessages.map((m) => m.messageId as V2MessageId);
      if (sourceMessageIds.length > 0) {
        const payload: V2MemoryExtractPayload = {
          conversationId: input.conversationId,
          storyWorldId: conversation.storyWorldId as any,
          characterId: conversation.primaryCharacterId as any,
          sourceMessageIds,
        };
        const job = createV2ChatMaintenanceJob({
          jobId: `job:maint:${randomUUID()}` as V2MaintenanceJobId,
          jobType: "memory_extract",
          conversationId: input.conversationId,
          payload,
          status: "pending",
          attempts: 0,
          maxAttempts: 3,
        });
        await maintenanceJobs.enqueue(job).catch(() => undefined);
      }

      const hasActiveSummary = await maintenanceJobs.hasActiveJob(input.conversationId, "conversation_summary");
      if (!hasActiveSummary) {
        const summary = await summaries.get(input.conversationId);
        const allMessages = await messages.listByConversation(input.conversationId);
        let unsummarized = allMessages;
        if (summary?.coveredUntilMessageId) {
          const coveredIndex = allMessages.findIndex((m) => m.messageId === summary.coveredUntilMessageId);
          if (coveredIndex >= 0) {
            unsummarized = allMessages.slice(coveredIndex + 1);
          }
        }
        if (unsummarized.length >= 20) {
          const batch = unsummarized.slice(0, 30);
          const summarySourceIds = batch.map((m) => m.messageId as V2MessageId);
          const fromMessageId = summarySourceIds[0]!;
          const toMessageId = summarySourceIds[summarySourceIds.length - 1]!;
          const summaryPayload: V2ConversationSummaryPayload = {
            conversationId: input.conversationId,
            storyWorldId: conversation.storyWorldId as any,
            characterId: conversation.primaryCharacterId as any,
            sourceMessageIds: summarySourceIds,
            fromMessageId,
            toMessageId,
            ...(summary?.version === undefined ? {} : { previousSummaryVersion: summary.version }),
            ...(summary?.coveredUntilMessageId === undefined ? {} : { coveredUntilMessageId: summary.coveredUntilMessageId as V2MessageId }),
          };
          const summaryJob = createV2ChatMaintenanceJob({
            jobId: `job:maint:${randomUUID()}` as V2MaintenanceJobId,
            jobType: "conversation_summary",
            conversationId: input.conversationId,
            payload: summaryPayload,
            status: "pending",
            attempts: 0,
            maxAttempts: 3,
          });
          await maintenanceJobs.enqueue(summaryJob).catch(() => undefined);
        }
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
