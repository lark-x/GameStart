import type {
  V2CharacterId,
  V2ConversationId,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2MediaId,
  V2MemoryId,
  V2MessageId,
  V2StoryWorldId,
} from "../shared/index.ts";

export type V2ChatRole = "user" | "assistant" | "system";
export type V2ChatMessageStatus = "pending" | "completed" | "failed" | "interrupted";
export type V2MessageAttachmentKind = "image";
export type V2MemoryKind = "profile" | "preference" | "relationship" | "episodic" | "world_fact";
export type V2MemoryStatus = "active" | "superseded" | "forgotten";

export interface V2ChatConversationDto {
  readonly conversationId: V2ConversationId;
  readonly storyWorldId: V2StoryWorldId;
  readonly primaryCharacterId: V2CharacterId;
  readonly title?: string;
  readonly createdAt: V2IsoDateTime;
  readonly updatedAt: V2IsoDateTime;
  readonly lastMessageAt?: V2IsoDateTime;
}

export interface V2ChatMessageAttachment {
  readonly attachmentId: string;
  readonly kind: V2MessageAttachmentKind;
  readonly mediaId: V2MediaId;
  readonly mediaRef: string;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
}

export interface V2ChatMessageDto {
  readonly messageId: V2MessageId;
  readonly conversationId: V2ConversationId;
  readonly role: V2ChatRole;
  readonly characterId?: V2CharacterId;
  readonly text?: string;
  readonly attachments: readonly V2ChatMessageAttachment[];
  readonly status: V2ChatMessageStatus;
  readonly createdAt: V2IsoDateTime;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly replyToMessageId?: V2MessageId;
}

export interface V2ChatMediaDto {
  readonly mediaId: V2MediaId;
  readonly contentHash: string;
  readonly mediaRef: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width?: number;
  readonly height?: number;
  readonly createdAt: V2IsoDateTime;
}

export interface V2CreateInstantStoryRequest {
  readonly persona: string;
  readonly displayName?: string;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2CreateInstantStoryResponse {
  readonly storyWorld: {
    readonly storyWorldId: V2StoryWorldId;
    readonly name: string;
    readonly summary?: string;
  };
  readonly character: {
    readonly characterId: V2CharacterId;
    readonly name: string;
    readonly personaText: string;
  };
  readonly conversation: V2ChatConversationDto;
}

export interface V2ConversationListResponse {
  readonly conversations: readonly V2ChatConversationDto[];
}

export interface V2ChatMessageListResponse {
  readonly messages: readonly V2ChatMessageDto[];
}

export interface V2ChatMessagePageResponse {
  readonly messages: readonly V2ChatMessageDto[];
  readonly hasMore: boolean;
  readonly nextBeforeMessageId?: V2MessageId;
}

export interface V2SendChatMessageRequest {
  readonly text?: string;
  readonly attachmentIds?: readonly V2MediaId[];
  readonly replyToMessageId?: V2MessageId;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2SendChatMessageResponse {
  readonly message: V2ChatMessageDto;
}

export interface V2GenerateChatReplyRequest {
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2ChatMediaUploadResponse {
  readonly media: V2ChatMediaDto;
}

export interface V2MemoryDto {
  readonly memoryId: V2MemoryId;
  readonly storyWorldId: V2StoryWorldId;
  readonly conversationId?: V2ConversationId;
  readonly characterId?: V2CharacterId;
  readonly kind: V2MemoryKind;
  readonly content: string;
  readonly importance: number;
  readonly confidence: number;
  readonly sourceMessageIds: readonly V2MessageId[];
  readonly status: V2MemoryStatus;
  readonly supersedesMemoryId?: V2MemoryId;
  readonly createdAt: V2IsoDateTime;
  readonly updatedAt: V2IsoDateTime;
  readonly lastAccessedAt?: V2IsoDateTime;
}

export interface V2ConversationSummaryDto {
  readonly conversationId: V2ConversationId;
  readonly summary: string;
  readonly coveredUntilMessageId: V2MessageId;
  readonly sourceMessageCount: number;
  readonly updatedAt: V2IsoDateTime;
  readonly version: number;
}

export interface V2ChatContextInput {
  readonly conversationId: V2ConversationId;
  readonly currentInput?: string;
  readonly tokenBudget: number;
}

export interface V2PromptLogEntry {
  readonly task: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly contextHash: string;
  readonly estimatedTokens: number;
  readonly memoryCount: number;
  readonly recentMessageCount: number;
  readonly imageCount: number;
  readonly provider: string;
  readonly model: string;
  readonly latencyMs: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}
