import type {
  V2ConversationId,
  V2IsoDateTime,
  V2MessageId,
  V2StoryWorldId,
} from "../shared/index.ts";
import type { V2FactAssertion, V2FactAssertionBatch } from "../fact/index.ts";
import type { V2MemoryKind } from "../chat/index.ts";

export type V2MemoryEngineId = "builtin_structured" | "builtin_hybrid" | (string & {});

export type V2MemoryScopeType = "user" | "world" | "character" | "conversation";
export type { V2MemoryKind };

export interface V2MemoryEngineCapabilities {
  readonly acceptsFactAssertions: boolean;
  readonly acceptsRawMessages: boolean;
  readonly supportsMutation: boolean;
  readonly supportsEmbedding: boolean;
  readonly supportsEntityIndex: boolean;
  readonly supportsTemporalFacts: boolean;
}

export interface V2MemoryQuery {
  readonly storyWorldId: V2StoryWorldId;
  readonly conversationId: V2ConversationId;
  readonly characterId?: string;
  readonly query: string;
  readonly limit: number;
  readonly now?: string;
}

export interface V2RetrievedMemory {
  readonly memoryId: string;
  readonly engineId: V2MemoryEngineId;
  readonly scopeType: V2MemoryScopeType;
  readonly scopeId: string;
  readonly kind: V2MemoryKind;
  readonly text: string;
  readonly relevance: number;
  readonly importance: number;
  readonly confidence: number;
  readonly sourceAssertionIds: readonly string[];
  readonly sourceMessageIds: readonly V2MessageId[];
  readonly observedAt?: V2IsoDateTime;
  readonly validFrom?: V2IsoDateTime;
  readonly validUntil?: V2IsoDateTime;
}

export interface V2MemoryConsumeResult {
  readonly engineId: V2MemoryEngineId;
  readonly batchId: string;
  readonly inputAssertionCount: number;
  readonly outputMemoryCount: number;
  readonly mutated: boolean;
  readonly errorCode?: string;
}

export interface V2MemoryEngineRunDto {
  readonly runId: string;
  readonly engineId: V2MemoryEngineId;
  readonly batchId: string;
  readonly status: "running" | "completed" | "failed";
  readonly inputAssertionCount: number;
  readonly outputMemoryCount: number;
  readonly durationMs?: number;
  readonly errorCode?: string;
  readonly startedAt: V2IsoDateTime;
  readonly completedAt?: V2IsoDateTime;
}

export type V2MemoryEngineConsumeInput = {
  readonly batch: V2FactAssertionBatch;
  readonly assertions: readonly V2FactAssertion[];
};
