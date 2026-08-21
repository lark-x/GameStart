import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { V2MemoryQuery } from "@living-network/contracts/v2";
import type { V2MemoryEngine } from "@living-network/ports/v2";

import type { MemoryEvaluationCase } from "./fixtures.ts";

export interface MemoryEvaluationCaseResult {
  readonly caseId: string;
  readonly engineId: string;
  readonly recallAtK: number;
  readonly recallAt10: number;
  readonly mrr: number;
  readonly scopeLeakage: boolean;
  readonly retrievalMs: number;
  readonly returnedAssertionIds: readonly string[];
  readonly hit: boolean;
}

export interface MemoryEvaluationEngineReport {
  readonly engineId: string;
  readonly totalCases: number;
  readonly recallAt5: number;
  readonly recallAt10: number;
  readonly mrr: number;
  readonly scopeLeakageCount: number;
  readonly avgRetrievalMs: number;
  readonly cases: readonly MemoryEvaluationCaseResult[];
}

export function runMemoryEvaluation(input: {
  readonly engines: readonly V2MemoryEngine[];
  readonly cases: readonly MemoryEvaluationCase[];
  readonly traceDb?: DatabaseSync;
  readonly storeQueryText?: boolean;
  readonly characterId?: string;
}): Promise<readonly MemoryEvaluationEngineReport[]> {
  return Promise.all(input.engines.map(async (engine) => {
    const results: MemoryEvaluationCaseResult[] = [];
    for (const testCase of input.cases) {
      const startedAt = Date.now();
      const retrieved = await engine.retrieve({
        storyWorldId: testCase.storyWorldId as never,
        conversationId: testCase.conversationId as never,
        ...(input.characterId === undefined ? {} : { characterId: input.characterId }),
        query: testCase.query,
        limit: 10,
      } as V2MemoryQuery);
      const retrievalMs = Date.now() - startedAt;

      const returnedAssertionIds = retrieved.flatMap((memory) => memory.sourceAssertionIds);
      const hitIndex = testCase.expectedRequiredAssertionIds
        .map((id) => returnedAssertionIds.indexOf(id))
        .filter((index) => index >= 0);
      const hit = hitIndex.length === testCase.expectedRequiredAssertionIds.length;
      const recallAt5 = hitIndex.some((index) => index < 5) ? 1 : 0;
      const recallAt10 = hit ? 1 : 0;
      const mrr = hitIndex.length > 0 ? 1 / (Math.min(...hitIndex) + 1) : 0;
      const forbidden = testCase.forbiddenAssertionIds ?? [];
      const scopeLeakage = forbidden.some((id) => returnedAssertionIds.includes(id));

      if (input.traceDb !== undefined) {
        writeTrace(input.traceDb, {
          engineId: engine.id,
          conversationId: testCase.conversationId,
          query: testCase.query,
          storeQueryText: input.storeQueryText ?? false,
          resultMemoryIds: retrieved.map((memory) => memory.memoryId),
          resultAssertionIds: returnedAssertionIds,
          retrievalMs,
          candidateCount: retrieved.length,
          returnedCount: retrieved.length,
        });
      }

      results.push({
        caseId: testCase.caseId,
        engineId: engine.id,
        recallAtK: recallAt5,
        recallAt10,
        mrr,
        scopeLeakage,
        retrievalMs,
        returnedAssertionIds,
        hit,
      });
    }
    const recallAt5 = results.filter((result) => result.recallAtK === 1).length / results.length;
    const recallAt10 = results.filter((result) => result.recallAt10 === 1).length / results.length;
    const mrr = results.reduce((total, result) => total + result.mrr, 0) / results.length;
    const scopeLeakageCount = results.filter((result) => result.scopeLeakage).length;
    const avgRetrievalMs = results.reduce((total, result) => total + result.retrievalMs, 0) / results.length;
    return {
      engineId: engine.id,
      totalCases: results.length,
      recallAt5,
      recallAt10,
      mrr,
      scopeLeakageCount,
      avgRetrievalMs,
      cases: results,
    };
  }));
}

function writeTrace(
  db: DatabaseSync,
  input: {
    readonly engineId: string;
    readonly conversationId: string;
    readonly query: string;
    readonly storeQueryText: boolean;
    readonly resultMemoryIds: readonly string[];
    readonly resultAssertionIds: readonly string[];
    readonly retrievalMs: number;
    readonly candidateCount: number;
    readonly returnedCount: number;
  },
): void {
  const queryHash = createHash("sha256").update(input.query).digest("hex").slice(0, 32);
  db.prepare(`
    INSERT INTO v2_memory_retrieval_traces (
      trace_id, engine_id, conversation_id, query_hash, query_text,
      result_memory_ids_json, result_assertion_ids_json, retrieval_ms,
      candidate_count, returned_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `trace:${randomUUID()}`,
    input.engineId,
    input.conversationId,
    queryHash,
    input.storeQueryText ? input.query : null,
    JSON.stringify(input.resultMemoryIds),
    JSON.stringify(input.resultAssertionIds),
    input.retrievalMs,
    input.candidateCount,
    input.returnedCount,
    new Date().toISOString(),
  );
}
