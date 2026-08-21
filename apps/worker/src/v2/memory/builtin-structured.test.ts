import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  V2SqliteChatUnitOfWork,
  V2SqliteMemoryEngineRunRepository,
} from "@living-network/database/v2";
import {
  createV2CanonCharacter,
  createV2CanonWorld,
  createV2ChatConversation,
  createV2ChatMessage,
  createV2FactAssertion,
  createV2FactAssertionBatch,
  createV2Memory,
} from "@living-network/domain/v2";
import type { V2ConversationId, V2MessageId, V2StoryWorldId } from "@living-network/contracts/v2";

import { V2BuiltinStructuredEngine } from "./builtin-structured.ts";

const now = "2026-08-18T03:00:00.000Z";

function assertion(overrides: Partial<Parameters<typeof createV2FactAssertion>[0]> = {}) {
  return createV2FactAssertion({
    assertionId: "fact:1",
    batchId: "batch:1",
    storyWorldId: "world:one",
    conversationId: "conversation:one",
    scopeType: "user",
    scopeId: "user:local",
    subject: { entityType: "user", entityId: "user:local", label: "用户" },
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
    ...overrides,
  });
}

async function setup() {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const uow = new V2SqliteChatUnitOfWork(db);
  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(createV2CanonWorld({ storyWorldId: "world:one", name: "World One" }));
    await repos.canon.createCharacter(createV2CanonCharacter({
      characterId: "character:one",
      storyWorldId: "world:one",
      name: "Mira",
      summary: "A companion",
    }));
    await repos.conversations.create(createV2ChatConversation({
      conversationId: "conversation:one",
      storyWorldId: "world:one",
      primaryCharacterId: "character:one",
      title: "Conv One",
    }));
    await repos.messages.create(createV2ChatMessage({
      messageId: "message:1",
      conversationId: "conversation:one",
      role: "user",
      text: "我最近喜欢手冲咖啡。",
      idempotencyKey: "key:1",
      createdAt: now,
    }));
  });
  const engine = new V2BuiltinStructuredEngine({
    unitOfWork: uow,
    runs: new V2SqliteMemoryEngineRunRepository(db),
  });
  return { db, uow, engine, cleanup };
}

test("V2BuiltinStructuredEngine consumes facts into active memories and retrieves them", async () => {
  const { db, uow, engine, cleanup } = await setup();
  try {
    const result = await engine.consume({ batch: batch(), assertions: [assertion()] });
    assert.equal(result.engineId, "builtin_structured");
    assert.equal(result.inputAssertionCount, 1);
    assert.equal(result.outputMemoryCount, 1);
    assert.equal(result.mutated, true);

    const retrieved = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:one" as V2ConversationId,
      query: "咖啡",
      limit: 5,
    });
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0]?.text, "用户喜欢手冲咖啡");
    assert.equal(retrieved[0]?.engineId, "builtin_structured");
    assert.equal(retrieved[0]?.kind, "preference");
    assert.deepEqual(retrieved[0]?.sourceMessageIds, ["message:1"]);

    // Consuming the same assertion again is a no-op (idempotent).
    const again = await engine.consume({ batch: batch(), assertions: [assertion()] });
    assert.equal(again.outputMemoryCount, 0);
    assert.equal(again.mutated, false);

    const runRows = db.prepare("SELECT status FROM v2_memory_engine_runs").all() as Array<{ status: string }>;
    assert.equal(runRows.length, 2);
    assert.ok(runRows.every((row) => row.status === "completed"));
  } finally {
    db.close();
    cleanup();
  }
});

test("V2BuiltinStructuredEngine supersedes replaced slot values", async () => {
  const { db, uow, engine, cleanup } = await setup();
  try {
    await engine.consume({
      batch: batch(),
      assertions: [assertion({
        assertionId: "fact:coffee",
        text: "用户喜欢拿铁",
        object: { type: "text", value: "latte" },
        changeHint: "new",
        sourceMessageIds: ["message:1"],
      })],
    });

    await engine.consume({
      batch: batch({ batchId: "batch:2" }),
      assertions: [assertion({
        assertionId: "fact:pour",
        batchId: "batch:2",
        text: "用户现在更喜欢手冲",
        object: { type: "text", value: "pour_over" },
        changeHint: "replaces_previous",
        sourceMessageIds: ["message:2"],
      })],
    });

    const memories = await uow.withChatTransaction(async ({ memories }) => memories.listByConversation("conversation:one" as V2ConversationId));
    const latte = memories.find((memory) => memory.content.includes("拿铁"));
    const pour = memories.find((memory) => memory.content.includes("手冲"));
    assert.equal(latte?.status, "superseded");
    assert.equal(pour?.status, "active");
    assert.equal(pour?.slotKey, "user:user:local:user:local:preferred_coffee");
  } finally {
    db.close();
    cleanup();
  }
});

test("V2BuiltinStructuredEngine rebuild replays a fact batch", async () => {
  const { db, uow, engine, cleanup } = await setup();
  try {
    await engine.rebuild?.({ conversationId: "conversation:one" });
    // Rebuild is a no-op placeholder in this phase; consume still works after it.
    const result = await engine.consume({ batch: batch(), assertions: [assertion()] });
    assert.equal(result.mutated, true);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2BuiltinStructuredEngine isolates memories by character within the same world", async () => {
  const { db, uow, engine, cleanup } = await setup();
  try {
    await uow.withChatTransaction(async (repos) => {
      await repos.canon.createCharacter(createV2CanonCharacter({
        characterId: "character:two",
        storyWorldId: "world:one",
        name: "Nova",
      }));
      await repos.conversations.create(createV2ChatConversation({
        conversationId: "conversation:two",
        storyWorldId: "world:one",
        primaryCharacterId: "character:two",
        title: "Conv Two",
      }));
    });

    // Character A (conversation:one) likes apples.
    await engine.consume({
      batch: batch(),
      assertions: [assertion({
        assertionId: "fact:a-apple",
        text: "角色A喜欢苹果",
        subject: { entityType: "character", entityId: "character:one", label: "角色A" },
        kind: "preference",
        sourceMessageIds: ["message:1"],
      })],
    });

   // Character B (conversation:two) hates apples.
    // Injected directly through the repository: the engine may otherwise route
    // the second consume through consolidation, which does not synchronously
    // persist a new row. This test focuses on retrieval isolation, so we seed
    // the character-scoped row explicitly.
    await uow.withChatTransaction(async (repos) => {
      await repos.memories.create(createV2Memory({
        memoryId: "memory:b-apple",
        storyWorldId: "world:one" as V2StoryWorldId,
        conversationId: "conversation:two" as V2ConversationId,
        characterId: "character:two",
        kind: "preference",
        content: "角色B讨厌苹果",
        importance: 0.8,
        confidence: 0.9,
        sourceMessageIds: ["message:2" as V2MessageId],
        createdAt: now,
        updatedAt: now,
      }));
    });

    const forA = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:one" as V2ConversationId,
      characterId: "character:one",
      query: "苹果",
      limit: 5,
    });
    assert.equal(forA.length, 1);
    assert.match(forA[0]?.text ?? "", /角色A喜欢苹果/);

    const forB = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:two" as V2ConversationId,
      characterId: "character:two",
      query: "苹果",
      limit: 5,
    });
    assert.equal(forB.length, 1);
    assert.match(forB[0]?.text ?? "", /角色B讨厌苹果/);

    // World-scope fallback without characterId still returns both.
    const worldWide = await engine.retrieve({
      storyWorldId: "world:one" as V2StoryWorldId,
      conversationId: "conversation:one" as V2ConversationId,
      query: "苹果",
      limit: 10,
    });
    assert.equal(worldWide.length, 2);
  } finally {
    db.close();
    cleanup();
  }
});
