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
  V2ConversationSummary,
  V2Memory,
} from "@living-network/domain/v2";
import type { V2CanonRepository } from "../core/index.ts";

export interface V2ChatConversationRepository {
  create(input: V2ChatConversation): Promise<V2ChatConversation>;
  get(conversationId: V2ConversationId): Promise<V2ChatConversation | undefined>;
  list(): Promise<readonly V2ChatConversation[]>;
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
  findByIdempotencyKey(conversationId: V2ConversationId, idempotencyKey: string): Promise<V2ChatMessage | undefined>;
  countByConversation(conversationId: V2ConversationId): Promise<number>;
  countUserMessagesByConversation(conversationId: V2ConversationId): Promise<number>;
}

export interface V2ChatMediaRepository {
  create(input: V2ChatMedia): Promise<V2ChatMedia>;
  get(mediaId: V2MediaId): Promise<V2ChatMedia | undefined>;
  listByIds(mediaIds: readonly V2MediaId[]): Promise<readonly V2ChatMedia[]>;
}

export interface V2MemoryRepository {
  create(input: V2Memory): Promise<V2Memory>;
  get(memoryId: V2MemoryId): Promise<V2Memory | undefined>;
  listActiveByStoryWorld(storyWorldId: V2StoryWorldId): Promise<readonly V2Memory[]>;
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

export interface V2ChatMaintenanceJobRepository {
  create(input: V2ChatMaintenanceJob): Promise<V2ChatMaintenanceJob>;
  findByDedupeKey(input: {
    readonly conversationId: V2ConversationId;
    readonly jobType: V2ChatMaintenanceJob["jobType"];
    readonly dedupeKey: string;
  }): Promise<V2ChatMaintenanceJob | undefined>;
  listPending(limit?: number): Promise<readonly V2ChatMaintenanceJob[]>;
  markClaimed(input: {
    readonly jobId: string;
    readonly claimedAt: string;
    readonly leaseExpiresAt: string;
  }): Promise<V2ChatMaintenanceJob>;
  complete(input: { readonly jobId: string; readonly completedAt: string }): Promise<V2ChatMaintenanceJob>;
  fail(input: { readonly jobId: string; readonly error: string; readonly updatedAt: string }): Promise<V2ChatMaintenanceJob>;
}

export interface V2ChatUnitOfWork {
  withChatTransaction<T>(fn: (repositories: {
    readonly canon: V2CanonRepository;
    readonly conversations: V2ChatConversationRepository;
    readonly messages: V2ChatMessageRepository;
    readonly media: V2ChatMediaRepository;
    readonly memories: V2MemoryRepository;
    readonly summaries: V2ConversationSummaryRepository;
    readonly maintenanceJobs: V2ChatMaintenanceJobRepository;
  }) => Promise<T>): Promise<T>;
}
