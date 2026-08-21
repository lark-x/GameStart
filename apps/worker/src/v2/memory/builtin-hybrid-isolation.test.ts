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
    ...(overrides ?? {}),
  });
}

function batch(overrides: Partial<Parameters<typeof createV2FactAssertionBatch>[0]> = {}) {
  return createV2FactAssertionBatch({
    batchId: "batch:1",
    storyWorldId: "world:one",
    conversationId: "conversation:one",
    fromMessageId: "message:1",
    toMessageId: "message:2",
    sourceMessageIds: ["message:1", "message:2"],
    sourceHash: "sha256:abc",
    extractorVersion: "fact.extract:v1",
    ...(overrides ?? {}),
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

test("V2BuiltinHybridEngine scopes retrieval by character and conversation", async () => {
  const { db, engine, cleanup } = await setup();
  try {
    await engine.consume({
      batch: batch({}),
      assertions: [assertion({
        assertionId: "fact:char-a",
        scopeType: "character",
        scopeId: "character:one",
        subject: { entityType: "character", entityId: "character:one" },
        text: "角色A喜欢苹果",
        kind: "preference",
        sourceMessageIds: ["message:1"],
      })],
    });
    await engine.consume({
      batch: batch({ batchId: "batch:2" }),
      assertions: [assertion({
        assertionId: "fact:world",
        batchId: "batch:2",
        scopeType: "world",
        scopeId: "world:one",
        subject: { entityType: "concept", entityId: "concept:weather" },
        text: "这个世界在下雨",
        kind: "world_fact",
        sourceMessageIds: ["message:1"],
      })],
    });

    const forA = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:one" as V2ConversationId,
      characterId: "character:one",
      query: "苹果 下雨",
      limit: 10,
    });
    const texts = forA.map((item) => item.text).join("|");
    assert.match(texts, /角色A喜欢苹果/);
    assert.match(texts, /这个世界在下雨/);

    const otherConversation = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:two" as V2ConversationId,
      characterId: "character:one",
      query: "苹果 下雨",
      limit: 10,
    });
    const otherTexts = otherConversation.map((item) => item.text).join("|");
    assert.match(otherTexts, /角色A喜欢苹果/);
    assert.match(otherTexts, /这个世界在下雨/);

    const forB = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:three" as V2ConversationId,
      characterId: "character:two",
      query: "苹果 下雨",
      limit: 10,
    });
    const bTexts = forB.map((item) => item.text).join("|");
    assert.doesNotMatch(bTexts, /角色A喜欢苹果/);
    assert.match(bTexts, /这个世界在下雨/);
  } finally {
    db.close();
    cleanup();
  }
});
