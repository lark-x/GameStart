import type {
  V2ConversationId,
  V2MediaId,
  V2MemoryId,
  V2MessageId,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type {
  V2ChatConversation,
  V2ChatMaintenanceJob,
  V2ChatMedia,
  V2ChatMessage,
  V2ChatSticker,
  V2ChatTrace,
  V2ChatTraceStatus,
  V2ConversationSummary,
  V2Memory,
} from "@living-network/domain/v2";
import type { V2CanonRepository, V2CandidateReviewRepository } from "../core/index.ts";

export interface V2ChatConversationSummary {
  readonly conversationId: string;
  readonly storyWorldId: string;
  readonly primaryCharacterId: string;
  readonly title?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly characterName: string;
  readonly storyWorldName: string;
  readonly lastMessagePreview?: string;
  readonly lastMessageAt?: string;
  readonly lastMessageStatus?: V2ChatMessage["status"];
}

export interface V2ChatConversationRepository {
  create(input: V2ChatConversation): Promise<V2ChatConversation>;
  get(conversationId: V2ConversationId): Promise<V2ChatConversation | undefined>;
  list(): Promise<readonly V2ChatConversation[]>;
  listSummaries(): Promise<readonly V2ChatConversationSummary[]>;
  touchLastMessage(input: {
    readonly conversationId: V2ConversationId;
    readonly lastMessageAt: string;
  }): Promise<void>;
}

export interface V2ChatMessageRepository {
  create(input: V2ChatMessage): Promise<V2ChatMessage>;
  get(messageId: V2MessageId): Promise<V2ChatMessage | undefined>;
  listByConversation(conversationId: V2ConversationId, limit?: number): Promise<readonly V2ChatMessage[]>;
  listRecentByConversation(conversationId: V2ConversationId, limit?: number): Promise<readonly V2ChatMessage[]>;
  listBefore(conversationId: V2ConversationId, beforeMessageId: V2MessageId, limit?: number): Promise<readonly V2ChatMessage[]>;
  listByIds(conversationId: V2ConversationId, messageIds: readonly V2MessageId[]): Promise<readonly V2ChatMessage[]>;
  listAfter(conversationId: V2ConversationId, afterMessageId: V2MessageId | undefined, limit: number): Promise<readonly V2ChatMessage[]>;
  countAfter(conversationId: V2ConversationId, afterMessageId: V2MessageId | undefined): Promise<number>;
  findByIdempotencyKey(conversationId: V2ConversationId, idempotencyKey: string): Promise<V2ChatMessage | undefined>;
}

export interface V2ChatMediaRepository {
  create(input: V2ChatMedia): Promise<V2ChatMedia>;
  get(mediaId: V2MediaId): Promise<V2ChatMedia | undefined>;
  listByIds(mediaIds: readonly V2MediaId[]): Promise<readonly V2ChatMedia[]>;
}

export interface V2ChatStickerRepository {
  create(input: V2ChatSticker): Promise<V2ChatSticker>;
  list(): Promise<readonly V2ChatSticker[]>;
  touchLastUsed(input: { readonly stickerId: string; readonly lastUsedAt: string }): Promise<void>;
}

export interface V2MemoryRepository {
  create(input: V2Memory): Promise<V2Memory>;
  get(memoryId: V2MemoryId): Promise<V2Memory | undefined>;
  listByConversation(conversationId: V2ConversationId): Promise<readonly V2Memory[]>;
  listActiveByStoryWorld(storyWorldId: V2StoryWorldId): Promise<readonly V2Memory[]>;
  listActiveByCharacter(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly characterId: string;
    readonly limit?: number;
  }): Promise<readonly V2Memory[]>;
  countActiveByCharacter(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly characterId: string;
  }): Promise<number>;
  searchActive(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly query: string;
    readonly limit?: number;
  }): Promise<readonly V2Memory[]>;
  supersede(input: {
    readonly memoryId: V2MemoryId;
    readonly supersededByMemoryId?: V2MemoryId;
    readonly updatedAt: string;
  }): Promise<V2Memory>;
}

export interface V2ConversationSummaryRepository {
  get(conversationId: V2ConversationId): Promise<V2ConversationSummary | undefined>;
  save(input: V2ConversationSummary): Promise<V2ConversationSummary>;
}

export interface V2ChatTraceRepository {
  create(input: V2ChatTrace): Promise<V2ChatTrace>;
  update(input: {
    readonly traceId: string;
    readonly patch: {
      readonly status?: V2ChatTraceStatus;
      readonly messageId?: string;
      readonly firstTokenLatencyMs?: number;
      readonly totalLatencyMs?: number;
      readonly errorCode?: string;
    };
  }): Promise<void>;
  getLatest(conversationId: V2ConversationId): Promise<V2ChatTrace | undefined>;
}

export interface V2ChatMaintenanceJobRepository {
  enqueue(input: V2ChatMaintenanceJob): Promise<V2ChatMaintenanceJob>;
  get(jobId: string): Promise<V2ChatMaintenanceJob | undefined>;
  hasActiveJob(conversationId: V2ConversationId, jobType: string): Promise<boolean>;
  getMemoryExtractCursor(conversationId: V2ConversationId): Promise<V2MessageId | undefined>;
  setMemoryExtractCursor(conversationId: V2ConversationId, messageId: V2MessageId): Promise<void>;
  getStoryAnalyzeCursor(conversationId: V2ConversationId): Promise<V2MessageId | undefined>;
  setStoryAnalyzeCursor(conversationId: V2ConversationId, messageId: V2MessageId): Promise<void>;
  findJobByDedupeKey(jobType: string, dedupeKey: string): Promise<V2ChatMaintenanceJob | undefined>;
  isLeaseOwner(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly now: string;
  }): Promise<boolean>;
  claimNext(input: {
    readonly workerId: string;
    readonly leaseDurationMs: number;
    readonly now: string;
  }): Promise<V2ChatMaintenanceJob | undefined>;
  renewLease(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseExpiresAt: string;
    readonly now: string;
  }): Promise<boolean>;
  markCompleted(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly now: string;
  }): Promise<boolean>;
  markFailed(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly error: string;
    readonly retryAvailableAt?: string;
    readonly isTerminal: boolean;
    readonly now: string;
  }): Promise<boolean>;
  retryFailed(input: { readonly jobId: string; readonly now: string }): V2ChatMaintenanceJob | undefined;
}

export interface V2ChatUnitOfWork {
  withChatTransaction<T>(fn: (repositories: {
    readonly canon: V2CanonRepository;
    readonly candidateReviews: V2CandidateReviewRepository;
    readonly conversations: V2ChatConversationRepository;
    readonly messages: V2ChatMessageRepository;
    readonly media: V2ChatMediaRepository;
    readonly stickers: V2ChatStickerRepository;
    readonly memories: V2MemoryRepository;
    readonly summaries: V2ConversationSummaryRepository;
    readonly traces: V2ChatTraceRepository;
    readonly maintenanceJobs: V2ChatMaintenanceJobRepository;
    readonly facts: import("../fact/index.ts").V2FactRepository;
  }) => Promise<T>): Promise<T>;
}
