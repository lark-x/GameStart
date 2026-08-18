import type {
  V2CharacterId,
  V2ConversationId,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2MaintenanceJobId,
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

export interface V2ChatTraceDto {
  readonly traceId: string;
  readonly conversationId: V2ConversationId;
  readonly messageId?: V2MessageId;
  readonly task: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly contextHash: string;
  readonly model?: string;
  readonly profileId?: string;
  readonly contextWindow: number;
  readonly inputBudget: number;
  readonly estimatedTokens: number;
  readonly recentMessageCount: number;
  readonly memoryIds: readonly V2MemoryId[];
  readonly canonIds: readonly string[];
  readonly summaryVersion?: number;
  readonly imageCount: number;
  readonly startedAt: string;
  readonly firstTokenLatencyMs?: number;
  readonly totalLatencyMs?: number;
  readonly status: "pending" | "streaming" | "completed" | "failed";
  readonly errorCode?: string;
}

export interface V2ChatDiagnosticsResponse {
  readonly trace?: V2ChatTraceDto;
  readonly templateId?: string;
  readonly inputBudget?: number;
  readonly selectedMemoryIds?: readonly V2MemoryId[];
  readonly summaryVersion?: number;
  readonly recentCount?: number;
  readonly imageCount?: number;
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

export type V2MaintenanceJobType =
  | "memory_extract"
  | "conversation_summary"
  | "memory_consolidate"
  | "story_analyze";

export type V2MaintenanceJobStatus = "pending" | "claimed" | "running" | "completed" | "failed";

export interface V2MemoryExtractPayload {
  readonly conversationId: V2ConversationId;
  readonly storyWorldId?: V2StoryWorldId;
  readonly characterId?: V2CharacterId;
  readonly sourceMessageIds: readonly V2MessageId[];
  readonly triggerReason?: string;
  readonly range?: {
    readonly fromMessageId?: V2MessageId;
    readonly toMessageId: V2MessageId;
  };
}

export interface V2ConversationSummaryPayload {
  readonly conversationId: V2ConversationId;
  readonly storyWorldId?: V2StoryWorldId;
  readonly characterId?: V2CharacterId;
  readonly sourceMessageIds: readonly V2MessageId[];
  readonly toMessageId?: V2MessageId;
  readonly fromMessageId?: V2MessageId;
  readonly coveredUntilMessageId?: V2MessageId;
  readonly previousSummaryId?: string;
  readonly previousSummaryVersion?: number;
  readonly range?: {
    readonly fromMessageId?: V2MessageId;
    readonly toMessageId: V2MessageId;
  };
}

export interface V2MemoryConsolidateCandidate {
  readonly kind: V2MemoryKind;
  readonly content: string;
  readonly importance: number;
  readonly confidence: number;
  readonly sourceMessageIds: readonly V2MessageId[];
}

export interface V2MemoryConsolidatePayload {
  readonly conversationId: V2ConversationId;
  readonly storyWorldId?: V2StoryWorldId;
  readonly characterId?: V2CharacterId;
  readonly existingMemoryId: V2MemoryId;
  readonly candidate: V2MemoryConsolidateCandidate;
}

export interface V2StoryAnalyzePayload {
  readonly conversationId: V2ConversationId;
  readonly storyWorldId?: V2StoryWorldId;
  readonly characterId?: V2CharacterId;
  readonly sourceMessageIds: readonly V2MessageId[];
  readonly fromMessageId?: V2MessageId;
  readonly toMessageId?: V2MessageId;
}

export type V2MaintenanceJobPayload =
  | ({ readonly jobType: "memory_extract" } & V2MemoryExtractPayload)
  | ({ readonly jobType: "conversation_summary" } & V2ConversationSummaryPayload)
  | ({ readonly jobType: "memory_consolidate" } & V2MemoryConsolidatePayload)
  | ({ readonly jobType: "story_analyze" } & V2StoryAnalyzePayload);

export interface V2ChatMaintenanceJobDto {
  readonly jobId: string;
  readonly conversationId: V2ConversationId;
  readonly jobType: V2MaintenanceJobType;
  readonly status: V2MaintenanceJobStatus;
  readonly payload: V2MaintenanceJobPayload;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly availableAt: V2IsoDateTime;
  readonly leaseExpiresAt?: V2IsoDateTime;
  readonly claimedBy?: string;
  readonly lastStartedAt?: V2IsoDateTime;
  readonly createdAt: V2IsoDateTime;
  readonly updatedAt: V2IsoDateTime;
  readonly lastError?: string;
}

export interface V2ExtractedMemoryCandidate {
  readonly kind: V2MemoryKind;
  readonly content: string;
  readonly importance: number;
  readonly confidence: number;
  readonly sourceMessageIds: readonly V2MessageId[];
}

export interface V2MemoryExtractResult {
  readonly memories: readonly V2ExtractedMemoryCandidate[];
}

export type V2MemoryConsolidationAction = "keep_both" | "merge" | "supersede" | "ignore";

export interface V2MemoryConsolidateResult {
  readonly action: V2MemoryConsolidationAction;
  readonly mergedContent?: string;
  readonly confidence: number;
}

export interface V2StoryAnalyzeResult {
  readonly scenes: readonly {
    readonly title: string;
    readonly body: string;
    readonly choices: readonly {
      readonly label: string;
      readonly consequenceSummary?: string;
    }[];
  }[];
}

export interface V2TriggerStoryAnalyzeRequest {
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2TriggerStoryAnalyzeResponse {
  readonly jobId: string;
  readonly conversationId: V2ConversationId;
}
