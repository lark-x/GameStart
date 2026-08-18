import type {
  V2MemoryConsumeResult,
  V2MemoryEngineCapabilities,
  V2MemoryQuery,
  V2RetrievedMemory,
} from "@living-network/contracts/v2";
import type { V2FactAssertion, V2FactAssertionBatch } from "@living-network/domain/v2";

export type V2MemoryEngineConsumeInput = {
  readonly batch: V2FactAssertionBatch;
  readonly assertions: readonly V2FactAssertion[];
};

export interface V2MemoryRebuildRequest {
  readonly conversationId?: string;
  readonly storyWorldId?: string;
}

export interface V2MemoryEngine {
  readonly id: string;
  capabilities(): V2MemoryEngineCapabilities;
  consume(input: V2MemoryEngineConsumeInput): Promise<V2MemoryConsumeResult>;
  retrieve(input: V2MemoryQuery): Promise<readonly V2RetrievedMemory[]>;
  rebuild?(input: V2MemoryRebuildRequest): Promise<void>;
}

export interface V2MemoryEngineRegistry {
  get(engineId: string): V2MemoryEngine | undefined;
  list(): readonly V2MemoryEngine[];
}

export interface V2MemoryEngineRunRepository {
  start(input: {
    readonly runId: string;
    readonly engineId: string;
    readonly batchId: string;
    readonly inputAssertionCount: number;
  }): Promise<void>;
  complete(input: {
    readonly runId: string;
    readonly outputMemoryCount: number;
    readonly durationMs: number;
  }): Promise<void>;
  fail(input: {
    readonly runId: string;
    readonly errorCode: string;
    readonly durationMs?: number;
  }): Promise<void>;
}

export interface V2MemoryRuntime {
  readonly primaryEngineId: string;
  readonly shadowEngineIds: readonly string[];
  retrieve(input: V2MemoryQuery): Promise<readonly V2RetrievedMemory[]>;
  consumeForAllEngines(input: V2MemoryEngineConsumeInput): Promise<readonly V2MemoryConsumeResult[]>;
  listEngines(): readonly { readonly id: string; readonly mode: "primary" | "shadow" }[];
}
