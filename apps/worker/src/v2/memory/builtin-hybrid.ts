import { randomUUID } from "node:crypto";

import type {
  V2MemoryConsumeResult,
  V2MemoryEngineCapabilities,
  V2MemoryQuery,
  V2MemoryScopeType,
  V2RetrievedMemory,
} from "@living-network/contracts/v2";
import type {
  V2MemoryEngine,
  V2MemoryEngineConsumeInput,
  V2MemoryEngineRunRepository,
  V2MemoryRebuildRequest,
} from "@living-network/ports/v2";
import type { V2HybridMemoryRepository, V2HybridMemoryRow } from "@living-network/database/v2";
import type { V2MessageId } from "@living-network/contracts/v2";

export const BUILTIN_HYBRID_ENGINE_ID = "builtin_hybrid";

export class V2BuiltinHybridEngine implements V2MemoryEngine {
  public readonly id = BUILTIN_HYBRID_ENGINE_ID;

  private readonly store: V2HybridMemoryRepository;
  private readonly runs: V2MemoryEngineRunRepository;
  private readonly now: () => Date;

  public constructor(options: {
    readonly store: V2HybridMemoryRepository;
    readonly runs: V2MemoryEngineRunRepository;
    readonly now?: () => Date;
  }) {
    this.store = options.store;
    this.runs = options.runs;
    this.now = options.now ?? (() => new Date());
  }

  public capabilities(): V2MemoryEngineCapabilities {
    return {
      acceptsFactAssertions: true,
      acceptsRawMessages: false,
      supportsMutation: false,
      supportsEmbedding: false,
      supportsEntityIndex: true,
      supportsTemporalFacts: true,
    };
  }

  public async consume(input: V2MemoryEngineConsumeInput): Promise<V2MemoryConsumeResult> {
    const runId = `run:${BUILTIN_HYBRID_ENGINE_ID}:${randomUUID()}`;
    const startedAt = this.now();
    await this.runs.start({
      runId,
      engineId: this.id,
      batchId: input.batch.batchId,
      inputAssertionCount: input.assertions.length,
    });
    let appended = 0;
    try {
      for (const assertion of input.assertions) {
        const created = await this.store.append({
          memoryId: `hybrid:${assertion.assertionId}`,
          assertionId: assertion.assertionId,
          batchId: input.batch.batchId,
          storyWorldId: assertion.storyWorldId,
          conversationId: assertion.conversationId,
          scopeType: assertion.scopeType as V2HybridMemoryRow["scopeType"],
          scopeId: assertion.scopeId,
          subjectEntityType: assertion.subject.entityType,
          subjectEntityId: assertion.subject.entityId,
          predicate: assertion.predicate,
          kind: assertion.kind,
          text: assertion.text,
          importance: assertion.importanceHint,
          confidence: assertion.confidence,
          observedAt: assertion.observedAt,
          createdAt: this.now().toISOString(),
        });
        if (created) appended += 1;
      }
      await this.runs.complete({
        runId,
        outputMemoryCount: appended,
        durationMs: Date.now() - startedAt.getTime(),
      });
      return {
        engineId: this.id,
        batchId: input.batch.batchId,
        inputAssertionCount: input.assertions.length,
        outputMemoryCount: appended,
        mutated: appended > 0,
      };
    } catch (error) {
      const errorCode = (error as { code?: string } | undefined)?.code ?? "ENGINE_FAILED";
      await this.runs.fail({
        runId,
        errorCode,
        durationMs: Date.now() - startedAt.getTime(),
      });
      throw error;
    }
  }

  public async retrieve(input: V2MemoryQuery): Promise<readonly V2RetrievedMemory[]> {
    const rows = input.query.trim().length === 0
      ? await this.store.listRecent({
          storyWorldId: input.storyWorldId,
          conversationId: input.conversationId,
          limit: input.limit,
        })
      : await this.store.search({
          storyWorldId: input.storyWorldId,
          conversationId: input.conversationId,
          query: input.query,
          limit: input.limit,
        });
    return rows.map((row, index) => ({
      memoryId: row.memoryId,
      engineId: this.id,
      scopeType: row.scopeType as V2MemoryScopeType,
      scopeId: row.scopeId,
      kind: row.kind as V2RetrievedMemory["kind"],
      text: row.text,
      relevance: row.importance > 0 ? row.importance + 1 / (index + 2) : 0,
      importance: row.importance,
      confidence: row.confidence,
      sourceAssertionIds: [row.assertionId],
      sourceMessageIds: [] as V2MessageId[],
      observedAt: row.observedAt as never,
    }));
  }

  public async rebuild(input: V2MemoryRebuildRequest): Promise<void> {
    await this.store.clear({
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId as never }),
      ...(input.storyWorldId === undefined ? {} : { storyWorldId: input.storyWorldId as never }),
    });
  }
}
