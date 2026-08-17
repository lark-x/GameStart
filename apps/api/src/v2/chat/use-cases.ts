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
  V2CharacterId,
  V2ConversationId,
  V2ConversationListResponse,
  V2ChatMessageListResponse,
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
  listMessages(conversationId: V2ConversationId): Promise<V2ChatMessageListResponse>;
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
    listMessages: async (conversationId) => unitOfWork.withChatTransaction(async ({ conversations, messages }) => {
      await requireConversation(conversations, conversationId);
      return { messages: (await messages.listByConversation(conversationId, 200)).map(toMessageDto) };
    }),
    sendMessage: (conversationId, input) => sendMessage(unitOfWork, conversationId, input),
    prepareReply: (conversationId, input) => prepareReply(unitOfWork, conversationId, input),
    saveReply: (input) => saveReply(unitOfWork, input),
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

  return unitOfWork.withChatTransaction(async ({ canon, conversations }) => {
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
    const mediaItems = await media.listByIds(attachmentIds);
    if (mediaItems.length !== attachmentIds.length) {
      throw new V2HttpError(422, "VALIDATION_FAILED", "One or more attachments do not exist");
    }
    const attachments = mediaItems.map((item) => ({
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
    const recentMessages = await messages.listByConversation(conversationId, 40);
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

    const lastUser = [...recentMessages].reverse().find((message) => message.role === "user");
    const query = lastUser?.text ?? "";
    const memoryRows = query.trim().length > 0
      ? await searchMemories(memories, conversation.storyWorldId as V2StoryWorldId, query)
      : await memories.listActiveByStoryWorld(conversation.storyWorldId as V2StoryWorldId);
    const summary = await summaries.get(conversationId);

    const facts = await canon.listFacts(conversation.storyWorldId as V2StoryWorldId);
    const rules = await canon.listRules(conversation.storyWorldId as V2StoryWorldId);
    const hasUserTurn = recentMessages.some((message) => message.role === "user");
    const task = hasUserTurn ? "chat.reply" : "story.bootstrap";

    const context: PromptContext = {
      task,
      tokenBudget: DEFAULT_TOKEN_BUDGET,
      memories: memoryRows.slice(0, 10).map(toV2MemoryContext),
      recentMessages: recentMessages.slice(-24).map(toV2ChatMessageContext),
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
      ...(lastUser === undefined ? {} : {
        currentInput: {
          ...(lastUser.text === undefined ? {} : { text: lastUser.text }),
          imageCount: lastUser.attachments.length,
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
  return unitOfWork.withChatTransaction(async ({ conversations, messages }) => {
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
