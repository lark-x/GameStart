import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  V2SqliteChatUnitOfWork,
  V2SqliteHybridMemoryRepository,
  V2SqliteMemoryEngineRunRepository,
} from "@living-network/database/v2";
import { createV2CanonWorld, createV2ChatConversation } from "@living-network/domain/v2";

import { V2BuiltinHybridEngine } from "../builtin-hybrid.ts";
import { V2BuiltinStructuredEngine } from "../builtin-structured.ts";
import { EVALUATION_CASES, EVALUATION_CONVERSATION_ID, EVALUATION_FIXTURE_ASSERTIONS, EVALUATION_WORLD_ID } from "./fixtures.ts";
import { runMemoryEvaluation } from "./harness.ts";

test("Memory evaluation harness compares structured and hybrid engines on identical facts", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const uow = new V2SqliteChatUnitOfWork(db);
    await uow.withChatTransaction(async (repos) => {
      await repos.canon.createWorld(createV2CanonWorld({
        storyWorldId: EVALUATION_WORLD_ID,
        name: "Evaluation World",
        summary: "Evaluation fixtures world",
      }));
      await repos.conversations.create(createV2ChatConversation({
        conversationId: EVALUATION_CONVERSATION_ID,
        storyWorldId: EVALUATION_WORLD_ID,
        primaryCharacterId: "character:alice",
        title: "Evaluation Conversation",
      }));
    });
    const runs = new V2SqliteMemoryEngineRunRepository(db);
    const structured = new V2BuiltinStructuredEngine({ unitOfWork: uow, runs });
    const hybrid = new V2BuiltinHybridEngine({
      store: new V2SqliteHybridMemoryRepository(db),
      runs,
    });

    const batch = {
      batchId: "eval:batch:all",
      storyWorldId: EVALUATION_WORLD_ID,
      conversationId: EVALUATION_CONVERSATION_ID,
      fromMessageId: "eval:msg:20",
      toMessageId: "eval:msg:240",
      sourceMessageIds: ["eval:msg:20", "eval:msg:30", "eval:msg:240", "eval:msg:100"],
      sourceHash: "sha256:eval",
      extractorVersion: "fact.extract:v1",
      status: "completed" as const,
      createdAt: "2026-08-18T00:00:00.000Z",
      completedAt: "2026-08-18T00:00:00.000Z",
    };
    await structured.consume({ batch, assertions: EVALUATION_FIXTURE_ASSERTIONS });
    await hybrid.consume({ batch, assertions: EVALUATION_FIXTURE_ASSERTIONS });

    const reports = await runMemoryEvaluation({
      engines: [structured, hybrid],
      cases: EVALUATION_CASES,
      traceDb: db,
      storeQueryText: true,
    });

    assert.equal(reports.length, 2);
    const structuredReport = reports.find((report) => report.engineId === "builtin_structured");
    const hybridReport = reports.find((report) => report.engineId === "builtin_hybrid");
    assert.ok(structuredReport);
    assert.ok(hybridReport);

    // Structured: current state semantics; all cases hit; no forbidden leakage.
    assert.equal(structuredReport.totalCases, 3);
    assert.equal(structuredReport.recallAt5, 1);
    assert.ok(structuredReport.mrr >= 0.8, `expected mrr >= 0.8, got ${structuredReport.mrr}`);
    assert.equal(structuredReport.scopeLeakageCount, 0);
    assert.ok(structuredReport.cases.every((result) => result.hit));

    // Hybrid: append-only; it recalls the current preference but also retains
    // the superseded one, so the preference_change case reports leakage.
    assert.equal(hybridReport.recallAt5, 1);
    assert.equal(hybridReport.scopeLeakageCount, 1);
    const preferenceCase = hybridReport.cases.find((result) => result.caseId === "preference_change_current");
    assert.equal(preferenceCase?.hit, true);
    assert.equal(preferenceCase?.scopeLeakage, true);

    // Both engines retrieve through the same fact inputs and record traces.
    const traces = db.prepare("SELECT COUNT(*) AS count FROM v2_memory_retrieval_traces").get() as { readonly count: number };
    assert.equal(traces.count, 6);
    const withText = db.prepare("SELECT COUNT(*) AS count FROM v2_memory_retrieval_traces WHERE query_text IS NOT NULL").get() as { readonly count: number };
    assert.equal(withText.count, 6);
  } finally {
    db.close();
    cleanup();
  }
});
