import assert from "node:assert/strict";
import test from "node:test";

import type { V2FactAssertion, V2FactAssertionBatch } from "@living-network/domain/v2";
import { createV2FactAssertion, createV2FactAssertionBatch } from "@living-network/domain/v2";

import { applyV2Migrations, openV2TempSqliteConnection } from "../platform/index.ts";
import { V2SqliteFactRepository } from "./repository.ts";

function sampleBatch(overrides: Partial<V2FactAssertionBatch> = {}): V2FactAssertionBatch {
  return createV2FactAssertionBatch({
    batchId: "batch:one",
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

function sampleAssertion(overrides: Partial<V2FactAssertion> = {}): V2FactAssertion {
  return createV2FactAssertion({
    assertionId: "fact:one",
    batchId: "batch:one",
    storyWorldId: "world:one",
    conversationId: "conversation:one",
    scopeType: "user",
    scopeId: "user:local",
    subject: { entityType: "user", entityId: "user:local", label: "用户" },
    predicate: "preferred_coffee",
    object: { type: "text", value: "pour_over" },
    kind: "preference",
    text: "用户更喜欢手冲咖啡",
    changeHint: "replaces_previous",
    confidence: 0.96,
    importanceHint: 0.7,
    sourceMessageIds: ["message:2"],
    observedAt: "2026-08-18T00:00:00.000Z",
    extractorVersion: "fact.extract:v1",
    ...overrides,
  });
}

test("V2 fact repository persists batches and assertions and queries them back", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqliteFactRepository(db);

    const batch = await repository.createBatch(sampleBatch());
    assert.equal(batch.status, "pending");
    assert.deepEqual(batch.sourceMessageIds, ["message:1", "message:2"]);

    const assertion = await repository.createAssertions([sampleAssertion()]);
    assert.equal(assertion.length, 1);

    const byBatch = await repository.listAssertionsByBatch("batch:one");
    assert.equal(byBatch.length, 1);
    assert.equal(byBatch[0]?.predicate, "preferred_coffee");
    assert.equal(byBatch[0]?.subject.label, "用户");

    const byConversation = await repository.listAssertionsByConversation("conversation:one" as never);
    assert.equal(byConversation.length, 1);

    const single = await repository.getAssertion("fact:one");
    assert.equal(single?.object.value, "pour_over");

    const completed = await repository.updateBatchStatus({ batchId: "batch:one", status: "completed", completedAt: "2026-08-18T01:00:00.000Z" });
    assert.equal(completed?.status, "completed");
    assert.ok(completed?.completedAt);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 fact repository dedupes identical source ranges per extractor version", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqliteFactRepository(db);
    await repository.createBatch(sampleBatch());

    const duplicate = await repository.findBatchByRange({
      conversationId: "conversation:one" as never,
      fromMessageId: "message:1" as never,
      toMessageId: "message:2" as never,
      extractorVersion: "fact.extract:v1",
    });
    assert.ok(duplicate);
    assert.equal(duplicate.batchId, "batch:one");

    // Same range with a different extractor version is a distinct batch.
    const v2Batch = await repository.createBatch(sampleBatch({
      batchId: "batch:one-v2",
      extractorVersion: "fact.extract:v2",
    }));
    assert.equal(v2Batch.batchId, "batch:one-v2");

    // Re-inserting the same batch id violates the primary key.
    await assert.rejects(
      () => repository.createBatch(sampleBatch()),
      /UNIQUE constraint failed/,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 fact repository isolates extractor versions and supports batch pagination", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqliteFactRepository(db);
    await repository.createBatch(sampleBatch({ batchId: "batch:1", fromMessageId: "message:1", toMessageId: "message:8", extractorVersion: "fact.extract:v1" }));
    await repository.createBatch(sampleBatch({ batchId: "batch:2", fromMessageId: "message:9", toMessageId: "message:16", extractorVersion: "fact.extract:v1" }));
    await repository.createBatch(sampleBatch({ batchId: "batch:v2-1", fromMessageId: "message:1", toMessageId: "message:8", extractorVersion: "fact.extract:v2" }));
    await repository.createAssertions([
      sampleAssertion({ assertionId: "fact:v1-a", batchId: "batch:1" }),
      sampleAssertion({ assertionId: "fact:v2-a", batchId: "batch:v2-1", extractorVersion: "fact.extract:v2" }),
    ]);

    const v1Assertions = await repository.listAssertionsByConversation("conversation:one" as never, { extractorVersion: "fact.extract:v1" as never });
    assert.deepEqual(v1Assertions.map((item) => item.assertionId), ["fact:v1-a"]);

    const all = await repository.listBatchesByConversation("conversation:one" as never, { limit: 2 });
    assert.equal(all.length, 2);
    const lastBatchId = all[all.length - 1]?.batchId;
    assert.ok(lastBatchId);
    const page2 = await repository.listBatchesByConversation("conversation:one" as never, { limit: 2, afterBatchId: lastBatchId });
    assert.equal(page2.length, 1);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 fact repository tracks independent engine offsets", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqliteFactRepository(db);
    assert.equal(await repository.getEngineOffset("builtin_structured", "conversation:one"), undefined);

    await repository.setEngineOffset("builtin_structured", "conversation:one", "batch:1");
    await repository.setEngineOffset("builtin_hybrid", "conversation:one", "batch:2");

    assert.equal(await repository.getEngineOffset("builtin_structured", "conversation:one"), "batch:1");
    assert.equal(await repository.getEngineOffset("builtin_hybrid", "conversation:one"), "batch:2");

    await repository.setEngineOffset("builtin_structured", "conversation:one", "batch:3");
    assert.equal(await repository.getEngineOffset("builtin_structured", "conversation:one"), "batch:3");
    assert.equal(await repository.getEngineOffset("builtin_hybrid", "conversation:one"), "batch:2");
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 fact repository rolls back a failed batch transaction", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqliteFactRepository(db);
    await repository.createBatch(sampleBatch());
    // Inserting an assertion with a missing batch should fail and leave no partial row.
    await assert.rejects(
      () => repository.createAssertions([sampleAssertion({ batchId: "batch:missing" })]),
      /FOREIGN KEY constraint failed/,
    );
    const rows = db.prepare("SELECT COUNT(*) AS count FROM v2_fact_assertions").get() as { readonly count: number };
    assert.equal(rows.count, 0);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 fact repository counts distinct character subjects", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqliteFactRepository(db);

    assert.equal(await repository.countDistinctCharacterSubjects(), 0);

    await repository.createBatch(sampleBatch());
    await repository.createAssertions([
      sampleAssertion({
        assertionId: "fact:char:a",
        subject: { entityType: "character", entityId: "character:a", label: "Alice" },
      }),
      sampleAssertion({
        assertionId: "fact:char:b",
        subject: { entityType: "character", entityId: "character:b", label: "Bob" },
      }),
      // Same character again — must be deduped by DISTINCT.
      sampleAssertion({
        assertionId: "fact:char:a2",
        subject: { entityType: "character", entityId: "character:a", label: "Alice" },
      }),
      // A user subject must not be counted as a character.
      sampleAssertion({
        assertionId: "fact:user:u",
        subject: { entityType: "user", entityId: "user:u", label: "User" },
      }),
    ]);

    assert.equal(await repository.countDistinctCharacterSubjects(), 2);
  } finally {
    db.close();
    cleanup();
  }
});
