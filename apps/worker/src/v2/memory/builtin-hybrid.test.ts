import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  V2SqliteHybridMemoryRepository,
  V2SqliteMemoryEngineRunRepository,
} from "@living-network/database/v2";
import { createV2FactAssertion, createV2FactAssertionBatch } from "@living-network/domain/v2";
import type { V2ConversationId, V2StoryWorldId } from "@living-network/contracts/v2";

import { V2BuiltinHybridEngine } from "./builtin-hybrid.ts";

const now = "2026-08-18T03:00:00.000Z";

function assertion(overrides: Partial<Parameters<typeof createV2FactAssertion>[0]> = {}) {
  return createV2FactAssertion({
    assertionId: "fact:1",
    batchId: "batch:1",
    storyWorldId: "world:one",
    conversationId: "conversation:one",
    scopeType: "user",
    scopeId: "user:local",
    subject: { entityType: "user", entityId: "user:local" },
    predicate: "preferred_coffee",
    object: { type: "text", value: "pour_over" },
    kind: "preference",
    text: "用户喜欢手冲咖啡",
    changeHint: "new",
    confidence: 0.95,
    importanceHint: 0.8,
    sourceMessageIds: ["message:1"],
    observedAt: now,
    extractorVersion: "fact.extract:v1",
    ...overrides,
  });
}

function batch() {
  return createV2FactAssertionBatch({
    batchId: "batch:1",
    storyWorldId: "world:one",
    conversationId: "conversation:one",
    fromMessageId: "message:1",
    toMessageId: "message:2",
    sourceMessageIds: ["message:1", "message:2"],
    sourceHash: "sha256:abc",
    extractorVersion: "fact.extract:v1",
  });
}

async function setup() {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const engine = new V2BuiltinHybridEngine({
    store: new V2SqliteHybridMemoryRepository(db),
    runs: new V2SqliteMemoryEngineRunRepository(db),
  });
  return { db, engine, cleanup };
}

test("V2BuiltinHybridEngine appends assertions and rejects duplicates", async () => {
  const { db, engine, cleanup } = await setup();
  try {
    const first = await engine.consume({ batch: batch(), assertions: [assertion()] });
    assert.equal(first.outputMemoryCount, 1);
    assert.equal(first.mutated, true);

    const again = await engine.consume({ batch: batch(), assertions: [assertion()] });
    assert.equal(again.outputMemoryCount, 0);
    assert.equal(again.mutated, false);

    const rows = db.prepare("SELECT COUNT(*) AS count FROM v2_hybrid_memories").get() as { readonly count: number };
    assert.equal(rows.count, 1);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2BuiltinHybridEngine retrieves via FTS with entity metadata", async () => {
  const { engine, cleanup } = await setup();
  try {
    await engine.consume({
      batch: batch(),
      assertions: [
        assertion({
          assertionId: "fact:coffee",
          text: "用户喜欢手冲咖啡",
          predicate: "preferred_coffee",
        }),
        assertion({
          assertionId: "fact:tea",
          text: "用户现在更喜欢喝茶",
          predicate: "preferred_drink",
          changeHint: "replaces_previous",
          sourceMessageIds: ["message:2"],
        }),
      ],
    });

    const coffee = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:one" as V2ConversationId,
      query: "咖啡",
      limit: 5,
    });
    assert.equal(coffee.length, 1);
    assert.equal(coffee[0]?.text, "用户喜欢手冲咖啡");
    assert.equal(coffee[0]?.engineId, "builtin_hybrid");
    assert.deepEqual(coffee[0]?.sourceAssertionIds, ["fact:coffee"]);

    const tea = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:one" as V2ConversationId,
      query: "喝茶",
      limit: 5,
    });
    assert.equal(tea.length, 1);
    assert.equal(tea[0]?.text, "用户现在更喜欢喝茶");

    // Empty query returns recent items ordered by recency.
    const recent = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:one" as V2ConversationId,
      query: "",
      limit: 5,
    });
    assert.equal(recent.length, 2);
  } finally {
    cleanup();
  }
});

test("V2BuiltinHybridEngine keeps append-only history and rebuild clears derived data", async () => {
  const { engine, cleanup } = await setup();
  try {
    await engine.consume({
      batch: batch(),
      assertions: [
        assertion({ assertionId: "fact:latte", text: "用户喜欢拿铁", changeHint: "new", observedAt: "2026-08-01T00:00:00.000Z" }),
        assertion({ assertionId: "fact:pour", text: "用户现在更喜欢手冲", changeHint: "replaces_previous", observedAt: "2026-08-10T00:00:00.000Z" }),
      ],
    });

    // Both historical and current assertions are preserved (append-only).
    const all = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:one" as V2ConversationId,
      query: "用户",
      limit: 10,
    });
    assert.equal(all.length, 2);

    await engine.rebuild?.({ conversationId: "conversation:one" });
    const after = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:one" as V2ConversationId,
      query: "",
      limit: 10,
    });
    assert.equal(after.length, 0);
  } finally {
    cleanup();
  }
});
