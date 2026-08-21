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
  V2ChatContactDto,
  V2ChatContactsResponse,
  V2ChatConversationDto,
  V2ChatConversationSummaryDto,
  V2ChatConversationSummaryListResponse,
  V2ChatContextResponse,
  V2ChatStickerDto,
  V2ChatStickerListResponse,
  V2CreateChatStickerRequest,
  V2ChatTraceDto,
  V2ChatDiagnosticsResponse,
  V2ChatMediaDto,
  V2ChatMessageDto,
  V2ChatMessagePageResponse,
  V2CharacterId,
  V2ConversationId,
  V2ConversationListResponse,
  V2ConversationSummaryPayload,
  V2ChatMessageListResponse,
  V2CreateConversationRequest,
  V2CreateConversationResponse,
  V2CreateInstantStoryRequest,
  V2CreateInstantStoryResponse,
  V2GenerateChatReplyRequest,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2LocationId,
  V2MaintenanceJobId,
  V2MediaId,
  V2MemoryExtractPayload,
  V2MemoryId,
  V2MemoryDto,
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
  createV2ChatSticker,
  createV2ChatTrace,
  type V2CanonCharacter,
  type V2CanonWorld,
  type V2ChatConversation,
  type V2ChatMessage,
  type V2ChatTrace,
  type V2ConversationSummary,
  type V2Memory,
} from "@living-network/domain/v2";
import type {
  V2ChatConversationSummary,
  V2MemoryRuntime,
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
  readonly summaryVersion?: number;
}

export interface V2ChatUseCases {
  createInstantStory(input: V2CreateInstantStoryRequest): Promise<V2CreateInstantStoryResponse>;
  listConversations(): Promise<V2ConversationListResponse>;
  listConversationSummaries(): Promise<V2ChatConversationSummaryListResponse>;
  listContacts(): Promise<V2ChatContactsResponse>;
  createConversation(input: V2CreateConversationRequest): Promise<V2CreateConversationResponse>;
  getConversationContext(conversationId: V2ConversationId): Promise<V2ChatContextResponse>;
  listStickers(): Promise<V2ChatStickerListResponse>;
  createSticker(input: V2CreateChatStickerRequest): Promise<V2ChatStickerDto>;
  touchStickerLastUsed(stickerId: string): Promise<void>;
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
  recordTrace(input: {
    readonly traceId: string;
    readonly conversationId: V2ConversationId;
    readonly messageId?: V2MessageId;
    readonly task?: string;
    readonly templateId?: string;
    readonly templateVersion?: string;
    readonly contextHash?: string;
    readonly model?: string;
    readonly profileId?: string;
    readonly contextWindow?: number;
    readonly inputBudget?: number;
    readonly estimatedTokens?: number;
    readonly recentMessageCount?: number;
    readonly memoryIds?: readonly string[];
    readonly canonIds?: readonly string[];
    readonly imageCount?: number;
    readonly summaryVersion?: number;
  }): Promise<void>;
  updateTrace(input: {
    readonly traceId: string;
    readonly patch: {
      readonly status?: "pending" | "streaming" | "completed" | "failed";
      readonly messageId?: V2MessageId;
      readonly firstTokenLatencyMs?: number;
      readonly totalLatencyMs?: number;
      readonly errorCode?: string;
    };
  }): Promise<void>;
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
const MEMORY_TRIGGER_THRESHOLD = 8;
const MEMORY_BATCH_MAX = 16;

function toTraceDto(trace: V2ChatTrace): V2ChatTraceDto {
  return {
    traceId: trace.traceId,
    conversationId: trace.conversationId as V2ConversationId,
    task: trace.task ?? "chat.reply",
    templateId: trace.templateId ?? "unknown",
    templateVersion: trace.templateVersion ?? "unknown",
    contextHash: trace.contextHash ?? "",
    contextWindow: trace.contextWindow ?? 0,
    inputBudget: trace.inputBudget ?? 0,
    estimatedTokens: trace.estimatedTokens ?? 0,
    recentMessageCount: trace.recentMessageCount ?? 0,
    memoryIds: (trace.memoryIds ?? []) as V2MemoryId[],
    canonIds: trace.canonIds ?? [],
    imageCount: trace.imageCount ?? 0,
    startedAt: trace.startedAt as V2IsoDateTime,
    status: trace.status,
    ...(trace.messageId === undefined ? {} : { messageId: trace.messageId as V2MessageId }),
    ...(trace.model === undefined ? {} : { model: trace.model }),
    ...(trace.profileId === undefined ? {} : { profileId: trace.profileId }),
    ...(trace.summaryVersion === undefined ? {} : { summaryVersion: trace.summaryVersion }),
    ...(trace.firstTokenLatencyMs === undefined ? {} : { firstTokenLatencyMs: trace.firstTokenLatencyMs }),
    ...(trace.totalLatencyMs === undefined ? {} : { totalLatencyMs: trace.totalLatencyMs }),
    ...(trace.errorCode === undefined ? {} : { errorCode: trace.errorCode }),
  };
}

export function createV2ChatUseCases(
  unitOfWork: V2ChatUnitOfWork,
  options: { readonly memoryRuntime?: V2MemoryRuntime } = {},
): V2ChatUseCases {
  return {
    recordTrace: (input) => unitOfWork.withChatTransaction(async ({ traces }) => {
      await traces.create(createV2ChatTrace({
        traceId: input.traceId,
        conversationId: input.conversationId,
        status: "pending",
        ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
        ...(input.task === undefined ? {} : { task: input.task }),
        ...(input.templateId === undefined ? {} : { templateId: input.templateId }),
        ...(input.templateVersion === undefined ? {} : { templateVersion: input.templateVersion }),
        ...(input.contextHash === undefined ? {} : { contextHash: input.contextHash }),
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.profileId === undefined ? {} : { profileId: input.profileId }),
        ...(input.contextWindow === undefined ? {} : { contextWindow: input.contextWindow }),
        ...(input.inputBudget === undefined ? {} : { inputBudget: input.inputBudget }),
        ...(input.estimatedTokens === undefined ? {} : { estimatedTokens: input.estimatedTokens }),
        ...(input.recentMessageCount === undefined ? {} : { recentMessageCount: input.recentMessageCount }),
        ...(input.memoryIds === undefined ? {} : { memoryIds: input.memoryIds }),
        ...(input.canonIds === undefined ? {} : { canonIds: input.canonIds }),
        ...(input.imageCount === undefined ? {} : { imageCount: input.imageCount }),
        ...(input.summaryVersion === undefined ? {} : { summaryVersion: input.summaryVersion }),
      }));
    }),
    updateTrace: (input) => unitOfWork.withChatTransaction(async ({ traces }) => {
      await traces.update(input);
    }),
    createInstantStory: (input) => createInstantStory(unitOfWork, input),
    listConversations: async () => unitOfWork.withChatTransaction(async ({ conversations }) => ({
      conversations: (await conversations.list()).map(toConversationDto),
    })),
    listConversationSummaries: async () => unitOfWork.withChatTransaction(async ({ conversations }) => ({
      conversations: (await conversations.listSummaries()).map(toConversationSummaryDto),
    })),
    listContacts: () => listContacts(unitOfWork),
    createConversation: (input) => createConversation(unitOfWork, input),
    getConversationContext: (conversationId) => getConversationContext(unitOfWork, conversationId),
    listStickers: () => listStickers(unitOfWork),
    createSticker: (input) => createSticker(unitOfWork, input),
    touchStickerLastUsed: (stickerId) => touchStickerLastUsed(unitOfWork, stickerId),
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
    prepareReply: (conversationId, input, runtimeBudget) =>
      prepareReply(unitOfWork, conversationId, input, runtimeBudget, options.memoryRuntime),
    saveReply: (input) => saveReply(unitOfWork, input),
    getLatestDiagnostics: async (conversationId) => unitOfWork.withChatTransaction(async ({ conversations, traces }) => {
      await requireConversation(conversations, conversationId);
      const trace = await traces.getLatest(conversationId);
      if (trace === undefined) return {};
      const traceDto = toTraceDto(trace);
      return {
        trace: traceDto,
        templateId: traceDto.templateId,
        inputBudget: traceDto.inputBudget,
        ...(traceDto.estimatedTokens === undefined ? {} : { estimatedTokens: traceDto.estimatedTokens }),
        selectedMemoryIds: traceDto.memoryIds,
        ...(traceDto.summaryVersion === undefined ? {} : { summaryVersion: traceDto.summaryVersion }),
        recentCount: traceDto.recentMessageCount,
        imageCount: traceDto.imageCount,
      };
    }),
    triggerStoryAnalyze: async (conversationId, input) => unitOfWork.withChatTransaction(async ({ conversations, maintenanceJobs, messages }) => {
      const conversation = await requireConversation(conversations, conversationId);
      const analyzerCursor = await maintenanceJobs.getStoryAnalyzeCursor(conversationId);
      const allMessages = analyzerCursor === undefined
        ? await messages.listRecentByConversation(conversationId, 80)
        : await messages.listAfter(conversationId, analyzerCursor, 100);
      const sourceMessageIds = allMessages.map((m) => m.messageId as V2MessageId);
      const fromMessageId = sourceMessageIds[0];
      const toMessageId = sourceMessageIds[sourceMessageIds.length - 1];
      const idempotencyKey = `story_analyze:${conversationId}:${input.idempotencyKey}`;
      const existing = await maintenanceJobs.findJobByDedupeKey("story_analyze", idempotencyKey);
      if (existing !== undefined) {
        const existingPayload = existing.payload as unknown as V2StoryAnalyzePayload;
        const sameIds = existingPayload.sourceMessageIds.length === sourceMessageIds.length &&
          existingPayload.sourceMessageIds.every((id, index) => id === sourceMessageIds[index]);
        if (!sameIds) {
          throw new V2HttpError(409, "IDEMPOTENCY_CONFLICT", "Story analyze idempotency key was already used with a different message range");
        }
        return { jobId: existing.jobId as V2MaintenanceJobId, conversationId };
      }
      const jobId = `job:maint:${randomUUID()}` as V2MaintenanceJobId;
      const payload: V2StoryAnalyzePayload = {
        conversationId,
        storyWorldId: conversation.storyWorldId as any,
        characterId: conversation.primaryCharacterId as any,
        sourceMessageIds,
        idempotencyKey,
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
          dedupeKey: idempotencyKey,
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

function stableConversationId(storyWorldId: V2StoryWorldId, characterId: V2CharacterId): V2ConversationId {
  const hash = createHash("sha256").update(`${storyWorldId}\n${characterId}`).digest("hex").slice(0, 24);
  return `conversation:direct:${hash}` as V2ConversationId;
}

function conversationSummaryDto(
  conversation: V2ChatConversation,
  characterName: string,
  storyWorldName: string,
): V2ChatConversationSummaryDto {
  return {
    conversationId: conversation.conversationId as V2ConversationId,
    storyWorldId: conversation.storyWorldId as V2StoryWorldId,
    primaryCharacterId: conversation.primaryCharacterId as V2CharacterId,
    ...(conversation.title === undefined ? {} : { title: conversation.title }),
    createdAt: (conversation.createdAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    updatedAt: (conversation.updatedAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    characterName,
    storyWorldName,
    ...(conversation.lastMessageAt === undefined ? {} : { lastMessageAt: conversation.lastMessageAt as V2IsoDateTime }),
  };
}

async function listContacts(unitOfWork: V2ChatUnitOfWork): Promise<V2ChatContactsResponse> {
  return unitOfWork.withChatTransaction(async ({ canon, conversations, memories }) => {
    const worlds = await canon.listWorlds();
    const summaries = await conversations.listSummaries();
    const contacts: V2ChatContactDto[] = [];
    for (const world of worlds) {
      const characters = await canon.listCharacters(world.storyWorldId as V2StoryWorldId);
      const memoryCounts = await memories.countActiveGroupedByCharacter(world.storyWorldId as V2StoryWorldId);
      for (const character of characters) {
        const latest = summaries.find((summary) =>
          summary.storyWorldId === character.storyWorldId && summary.primaryCharacterId === character.characterId);
        const activeMemoryCount = memoryCounts.get(character.characterId) ?? 0;
        contacts.push({
          characterId: character.characterId as V2CharacterId,
          storyWorldId: character.storyWorldId as V2StoryWorldId,
          characterName: character.name,
          ...(character.summary === undefined ? {} : { characterSummary: character.summary }),
          storyWorldName: world.name,
          ...(latest?.conversationId === undefined ? {} : { latestConversationId: latest.conversationId as V2ConversationId }),
          ...(latest?.lastMessagePreview === undefined ? {} : { latestMessagePreview: latest.lastMessagePreview }),
          ...(latest?.lastMessageAt === undefined ? {} : { latestMessageAt: latest.lastMessageAt as V2IsoDateTime }),
          activeMemoryCount,
        });
      }
    }
    contacts.sort((a, b) => {
      const aTime = a.latestMessageAt === undefined ? 0 : Date.parse(a.latestMessageAt);
      const bTime = b.latestMessageAt === undefined ? 0 : Date.parse(b.latestMessageAt);
      if (aTime !== bTime) return bTime - aTime;
      return a.characterName.localeCompare(b.characterName);
    });
    return { contacts };
  });
}

async function createConversation(
  unitOfWork: V2ChatUnitOfWork,
  input: V2CreateConversationRequest,
): Promise<V2CreateConversationResponse> {
  return unitOfWork.withChatTransaction(async ({ canon, conversations }) => {
    const world = await canon.getWorld(input.storyWorldId);
    if (world === undefined) throw new V2HttpError(404, "NOT_FOUND", "Story world not found");
    const character = await canon.getCharacter({ storyWorldId: input.storyWorldId, characterId: input.characterId });
    if (character === undefined) throw new V2HttpError(404, "NOT_FOUND", "Character not found");
    const conversationId = stableConversationId(input.storyWorldId, input.characterId);
    const existing = await conversations.get(conversationId);
    if (existing !== undefined) {
      return { conversation: conversationSummaryDto(existing, character.name, world.name) };
    }
    const conversation = await conversations.create(createV2ChatConversation({
      conversationId,
      storyWorldId: input.storyWorldId,
      primaryCharacterId: input.characterId,
      title: character.name,
    }));
    return { conversation: conversationSummaryDto(conversation, character.name, world.name) };
  });
}

async function getConversationContext(
  unitOfWork: V2ChatUnitOfWork,
  conversationId: V2ConversationId,
): Promise<V2ChatContextResponse> {
  return unitOfWork.withChatTransaction(async ({ canon, conversations, memories }) => {
    const conversation = await requireConversation(conversations, conversationId);
    const storyWorldId = conversation.storyWorldId as V2StoryWorldId;
    const character = await canon.getCharacter({ storyWorldId, characterId: conversation.primaryCharacterId as V2CharacterId });
    const world = await canon.getWorld(storyWorldId);
    const recent = await memories.listActiveByCharacter({ storyWorldId, characterId: conversation.primaryCharacterId, limit: 8 });
    const activeCount = await memories.countActiveByCharacter({ storyWorldId, characterId: conversation.primaryCharacterId });
    const summary = (await conversations.listSummaries()).find((item) => item.conversationId === conversationId);
    return {
      conversation: summary === undefined
        ? conversationSummaryDto(conversation, character?.name ?? "角色已不存在", world?.name ?? "世界已不存在")
        : toConversationSummaryDto(summary),
      character: character === undefined
        ? { characterId: conversation.primaryCharacterId as V2CharacterId, name: "角色已不存在" }
        : {
            characterId: character.characterId as V2CharacterId,
            name: character.name,
            ...(character.summary === undefined ? {} : { summary: character.summary }),
            ...(character.personaText === undefined ? {} : { personaText: character.personaText }),
            ...(character.homeLocationId === undefined ? {} : { homeLocationId: character.homeLocationId as V2LocationId }),
          },
      world: world === undefined
        ? { storyWorldId, name: "世界已不存在" }
        : {
            storyWorldId: world.storyWorldId as V2StoryWorldId,
            name: world.name,
            ...(world.summary === undefined ? {} : { summary: world.summary }),
          },
      memory: {
        activeCount,
        recent: recent.map(toMemoryDto),
      },
    };
  });
}

async function listStickers(unitOfWork: V2ChatUnitOfWork): Promise<V2ChatStickerListResponse> {
  return unitOfWork.withChatTransaction(async ({ stickers }) => ({
    stickers: (await stickers.list()).map((sticker) => ({
      stickerId: sticker.stickerId,
      mediaId: sticker.mediaId as V2MediaId,
      mediaRef: sticker.mediaRef,
      label: sticker.label,
      createdAt: (sticker.createdAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
      ...(sticker.lastUsedAt === undefined ? {} : { lastUsedAt: sticker.lastUsedAt as V2IsoDateTime }),
    })),
  }));
}

async function createSticker(
  unitOfWork: V2ChatUnitOfWork,
  input: V2CreateChatStickerRequest,
): Promise<V2ChatStickerDto> {
  return unitOfWork.withChatTransaction(async ({ stickers, media }) => {
    const mediaItem = await media.get(input.mediaId);
    if (mediaItem === undefined) throw new V2HttpError(404, "NOT_FOUND", "Media not found");
    const sticker = await stickers.create(createV2ChatSticker({
      stickerId: `sticker:${randomUUID()}`,
      mediaId: mediaItem.mediaId,
      mediaRef: mediaItem.mediaRef,
      label: input.label,
    }));
    return {
      stickerId: sticker.stickerId,
      mediaId: sticker.mediaId as V2MediaId,
      mediaRef: sticker.mediaRef,
      label: sticker.label,
      createdAt: (sticker.createdAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
      ...(sticker.lastUsedAt === undefined ? {} : { lastUsedAt: sticker.lastUsedAt as V2IsoDateTime }),
    };
  });
}

async function touchStickerLastUsed(unitOfWork: V2ChatUnitOfWork, stickerId: string): Promise<void> {
  await unitOfWork.withChatTransaction(async ({ stickers }) => {
    await stickers.touchLastUsed({ stickerId, lastUsedAt: new Date().toISOString() });
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
  memoryRuntime?: V2MemoryRuntime,
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
    const memoryContexts = memoryRuntime === undefined
      ? query.trim().length > 0
        ? (await searchMemories(memories, conversation.storyWorldId as V2StoryWorldId, conversationId, conversation.primaryCharacterId as V2CharacterId, query)).map(toV2MemoryContext)
        : (await memories.listActiveScoped({
            storyWorldId: conversation.storyWorldId as V2StoryWorldId,
            conversationId,
            characterId: conversation.primaryCharacterId as V2CharacterId,
            limit: 10,
          })).map(toV2MemoryContext)
      : (await memoryRuntime.retrieve({
          storyWorldId: conversation.storyWorldId as V2StoryWorldId,
          conversationId,
          characterId: conversation.primaryCharacterId as V2CharacterId,
          query,
          limit: 10,
        })).map((item) => ({
          memoryId: item.memoryId,
          kind: item.kind,
          content: item.text,
          importance: item.importance,
          confidence: item.confidence,
        }));
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
      memories: memoryContexts.slice(0, 10),
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
          ...(currentUser.attachments.length === 0 ? {} : {
            images: currentUser.attachments.map((attachment) => ({
              mediaId: attachment.mediaId as V2MediaId,
              mediaRef: attachment.mediaRef,
              mimeType: attachment.mimeType,
            })),
          }),
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
      ...(summary === undefined ? {} : { summaryVersion: summary.version }),
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
      const hasActiveExtraction = await maintenanceJobs.hasActiveJob(input.conversationId, "memory_extract");
      const extractCursor = await maintenanceJobs.getMemoryExtractCursor(input.conversationId);
      const newMessageCount = await messages.countAfter(input.conversationId, extractCursor);
      const sourceMessageIds = !hasActiveExtraction && newMessageCount >= MEMORY_TRIGGER_THRESHOLD
        ? (await messages.listAfter(input.conversationId, extractCursor, MEMORY_BATCH_MAX)).map((m) => m.messageId as V2MessageId)
        : [];
      if (sourceMessageIds.length > 0) {
        const fromMessageId = sourceMessageIds[0]!;
        const toMessageId = sourceMessageIds[sourceMessageIds.length - 1]!;
        const payload: V2MemoryExtractPayload = {
          conversationId: input.conversationId,
          storyWorldId: conversation.storyWorldId as any,
          characterId: conversation.primaryCharacterId as any,
          sourceMessageIds,
          triggerReason: "cursor_batch",
          range: { fromMessageId, toMessageId },
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
        const coveredUntilMessageId = summary?.coveredUntilMessageId as V2MessageId | undefined;
        const unsummarizedCount = await messages.countAfter(input.conversationId, coveredUntilMessageId);
        if (unsummarizedCount >= 20) {
          const batch = await messages.listAfter(input.conversationId, coveredUntilMessageId, 30);
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
            ...(coveredUntilMessageId === undefined ? {} : { coveredUntilMessageId }),
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

async function searchMemories(
  memories: V2MemoryRepository,
  storyWorldId: V2StoryWorldId,
  conversationId: V2ConversationId,
  characterId: V2CharacterId,
  query: string,
): Promise<readonly V2Memory[]> {
  return memories.searchActiveScoped({ storyWorldId, conversationId, characterId, query, limit: 10 });
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

function toConversationSummaryDto(summary: V2ChatConversationSummary): V2ChatConversationSummaryDto {
  return {
    conversationId: summary.conversationId as V2ConversationId,
    storyWorldId: summary.storyWorldId as V2StoryWorldId,
    primaryCharacterId: summary.primaryCharacterId as V2CharacterId,
    ...(summary.title === undefined ? {} : { title: summary.title }),
    createdAt: (summary.createdAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    updatedAt: (summary.updatedAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    characterName: summary.characterName,
    storyWorldName: summary.storyWorldName,
    ...(summary.lastMessagePreview === undefined ? {} : { lastMessagePreview: summary.lastMessagePreview }),
    ...(summary.lastMessageAt === undefined ? {} : { lastMessageAt: summary.lastMessageAt as V2IsoDateTime }),
    ...(summary.lastMessageStatus === undefined ? {} : { lastMessageStatus: summary.lastMessageStatus }),
  };
}

function toMemoryDto(memory: V2Memory): V2MemoryDto {
  return {
    memoryId: memory.memoryId as V2MemoryId,
    storyWorldId: memory.storyWorldId as V2StoryWorldId,
    ...(memory.conversationId === undefined ? {} : { conversationId: memory.conversationId as V2ConversationId }),
    ...(memory.characterId === undefined ? {} : { characterId: memory.characterId as V2CharacterId }),
    scopeType: memory.scopeType,
    scopeId: memory.scopeId,
    kind: memory.kind,
    content: memory.content,
    importance: memory.importance,
    confidence: memory.confidence,
    sourceMessageIds: memory.sourceMessageIds as V2MessageId[],
    status: memory.status,
    ...(memory.supersedesMemoryId === undefined ? {} : { supersedesMemoryId: memory.supersedesMemoryId as V2MemoryId }),
    createdAt: (memory.createdAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    updatedAt: (memory.updatedAt ?? "1970-01-01T00:00:00.000Z") as V2IsoDateTime,
    ...(memory.lastAccessedAt === undefined ? {} : { lastAccessedAt: memory.lastAccessedAt as V2IsoDateTime }),
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
