import assert from "node:assert/strict";
import test from "node:test";

import { createV2CanonWorld, createV2ChatConversation, createV2ChatMessage, createV2Memory } from "@living-network/domain/v2";

import { applyV2Migrations, openV2TempSqliteConnection } from "../platform/index.ts";
import { V2SqliteChatUnitOfWork } from "./repository.ts";

test("V2 chat SQLite repository persists conversations, messages, and memories", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);

    const world = await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:chat",
      name: "Chat World",
    })));
    assert.equal(world.storyWorldId, "world:chat");

    const conversation = await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:one",
      storyWorldId: "world:chat",
      primaryCharacterId: "character:one",
      title: "花火",
    })));
    assert.equal(conversation.title, "花火");

    const message = await unit.withChatTransaction(async ({ messages, conversations }) => {
      await conversations.touchLastMessage({ conversationId: "conversation:one" as never, lastMessageAt: new Date().toISOString() });
      return messages.create(createV2ChatMessage({
        messageId: "message:one",
        conversationId: "conversation:one",
        role: "user",
        text: "我的生日是 3 月 12 日。",
        idempotencyKey: "key:one",
      }));
    });
    assert.equal(message.text, "我的生日是 3 月 12 日。");

    const memory = await unit.withChatTransaction(async ({ memories }) => memories.create(createV2Memory({
      memoryId: "memory:one",
      storyWorldId: "world:chat",
      conversationId: "conversation:one",
      kind: "profile",
      content: "用户的生日是 3 月 12 日",
      importance: 0.8,
      confidence: 0.95,
      sourceMessageIds: ["message:one"],
    })));
    assert.equal(memory.status, "active");

    const found = await unit.withChatTransaction(async ({ memories }) => memories.searchActive({
      storyWorldId: "world:chat" as never,
      query: "生日",
      limit: 5,
    }));
    assert.equal(found.length, 1);
    assert.equal(found[0]?.memoryId, "memory:one");

    const history = await unit.withChatTransaction(async ({ messages }) => messages.listByConversation("conversation:one" as never));
    assert.equal(history.length, 1);
    const byKey = await unit.withChatTransaction(async ({ messages }) => messages.findByIdempotencyKey("conversation:one" as never, "key:one"));
    assert.equal(byKey?.messageId, "message:one");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});

test("V2 chat message repository returns the latest recent messages and supports idempotency lookup", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);
    await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:recent",
      name: "Recent World",
    })));
    await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:recent",
      storyWorldId: "world:recent",
      primaryCharacterId: "character:one",
    })));

    for (let index = 1; index <= 500; index += 1) {
      await unit.withChatTransaction(async ({ messages }) => messages.create(createV2ChatMessage({
        messageId: `message:recent:${index}`,
        conversationId: "conversation:recent",
        role: index % 2 === 0 ? "assistant" : "user",
        text: `消息 ${index}`,
        idempotencyKey: `recent-key:${index}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      })));
    }

    const recent = await unit.withChatTransaction(async ({ messages }) => messages.listRecentByConversation("conversation:recent" as never, 40));
    assert.equal(recent.length, 40);
    assert.equal(recent[0]?.messageId, "message:recent:461");
    assert.equal(recent.at(-1)?.messageId, "message:recent:500");

    const before = await unit.withChatTransaction(async ({ messages }) => messages.listBefore("conversation:recent" as never, "message:recent:100" as never, 10));
    assert.equal(before.length, 10);
    assert.equal(before[0]?.messageId, "message:recent:90");
    assert.equal(before.at(-1)?.messageId, "message:recent:99");

    const existing = await unit.withChatTransaction(async ({ messages }) => messages.findByIdempotencyKey("conversation:recent" as never, "recent-key:123"));
    assert.equal(existing?.messageId, "message:recent:123");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});

test("V2 chat message repository supports fixed-range queries with cursor and id lists", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);
    await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:range",
      name: "Range World",
    })));
    await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:range",
      storyWorldId: "world:range",
      primaryCharacterId: "character:one",
    })));

    for (let index = 1; index <= 1000; index += 1) {
      await unit.withChatTransaction(async ({ messages }) => messages.create(createV2ChatMessage({
        messageId: `message:range:${index}`,
        conversationId: "conversation:range",
        role: index % 2 === 0 ? "assistant" : "user",
        text: `消息 ${index}`,
        idempotencyKey: `range-key:${index}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      })));
    }

    const listAfterFirst = await unit.withChatTransaction(async ({ messages }) =>
      messages.listAfter("conversation:range" as never, "message:range:10" as never, 5));
    assert.deepEqual(listAfterFirst.map((message) => message.messageId), [
      "message:range:11",
      "message:range:12",
      "message:range:13",
      "message:range:14",
      "message:range:15",
    ]);

    const listAfterMid = await unit.withChatTransaction(async ({ messages }) =>
      messages.listAfter("conversation:range" as never, "message:range:250" as never, 3));
    assert.deepEqual(listAfterMid.map((message) => message.messageId), [
      "message:range:251",
      "message:range:252",
      "message:range:253",
    ]);

    const listAfterEnd = await unit.withChatTransaction(async ({ messages }) =>
      messages.listAfter("conversation:range" as never, "message:range:999" as never, 10));
    assert.deepEqual(listAfterEnd.map((message) => message.messageId), ["message:range:1000"]);

    const listFromStart = await unit.withChatTransaction(async ({ messages }) =>
      messages.listAfter("conversation:range" as never, undefined, 4));
    assert.deepEqual(listFromStart.map((message) => message.messageId), [
      "message:range:1",
      "message:range:2",
      "message:range:3",
      "message:range:4",
    ]);

    const count = await unit.withChatTransaction(async ({ messages }) =>
      messages.countAfter("conversation:range" as never, "message:range:250" as never));
    assert.equal(count, 750);
    const countAll = await unit.withChatTransaction(async ({ messages }) =>
      messages.countAfter("conversation:range" as never, undefined));
    assert.equal(countAll, 1000);

    const byIds = await unit.withChatTransaction(async ({ messages }) =>
      messages.listByIds("conversation:range" as never, [
        "message:range:999" as never,
        "message:range:10" as never,
        "message:range:250" as never,
      ]));
    assert.deepEqual(byIds.map((message) => message.messageId), [
      "message:range:999",
      "message:range:10",
      "message:range:250",
    ]);

    const withMissing = await unit.withChatTransaction(async ({ messages }) =>
      messages.listByIds("conversation:range" as never, [
        "message:range:10" as never,
        "message:missing" as never,
        "message:range:20" as never,
      ]));
    assert.deepEqual(withMissing.map((message) => message.messageId), ["message:range:10", "message:range:20"]);

    const otherConversation = await unit.withChatTransaction(async ({ messages }) =>
      messages.listByIds("conversation:other" as never, ["message:range:10" as never]));
    assert.equal(otherConversation.length, 0);
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});

test("V2 maintenance job CAS prevents a stale worker from completing or failing a reclaimed job", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);
    await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:lease",
      name: "Lease World",
    })));
    await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:lease",
      storyWorldId: "world:lease",
      primaryCharacterId: "character:one",
    })));
    await unit.withChatTransaction(async ({ maintenanceJobs }) => maintenanceJobs.enqueue({
      jobId: "job:lease:1",
      conversationId: "conversation:lease" as never,
      jobType: "memory_extract",
      status: "pending",
      payload: { conversationId: "conversation:lease" as never, sourceMessageIds: [] },
      attempts: 0,
      maxAttempts: 3,
      availableAt: "2026-08-12T03:00:00.000Z",
    }));

    const claimedByA = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.claimNext({ workerId: "worker-a", leaseDurationMs: 30000, now: "2026-08-12T03:00:00.000Z" }));
    assert.equal(claimedByA?.jobId, "job:lease:1");

    const completedByA = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.markCompleted({ jobId: "job:lease:1", workerId: "worker-a", now: "2026-08-12T03:00:01.000Z" }));
    assert.equal(completedByA, true);

    await unit.withChatTransaction(async ({ maintenanceJobs }) => maintenanceJobs.enqueue({
      jobId: "job:lease:2",
      conversationId: "conversation:lease" as never,
      jobType: "memory_extract",
      status: "pending",
      payload: { conversationId: "conversation:lease" as never, sourceMessageIds: [] },
      attempts: 0,
      maxAttempts: 3,
      availableAt: "2026-08-12T03:00:00.000Z",
    }));

    const claimedByA2 = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.claimNext({ workerId: "worker-a", leaseDurationMs: 30000, now: "2026-08-12T03:00:00.000Z" }));
    assert.equal(claimedByA2?.jobId, "job:lease:2");

    // A's lease expires; B reclaims the same job.
    const claimedByB = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.claimNext({ workerId: "worker-b", leaseDurationMs: 30000, now: "2026-08-12T03:00:31.000Z" }));
    assert.equal(claimedByB?.jobId, "job:lease:2");
    assert.equal(claimedByB?.claimedBy, "worker-b");

    // A tries to complete after losing the lease: must not change the row.
    const staleComplete = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.markCompleted({ jobId: "job:lease:2", workerId: "worker-a", now: "2026-08-12T03:00:32.000Z" }));
    assert.equal(staleComplete, false);

    const staleFail = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.markFailed({
        jobId: "job:lease:2",
        workerId: "worker-a",
        error: "stale worker error",
        isTerminal: false,
        now: "2026-08-12T03:00:33.000Z",
      }));
    assert.equal(staleFail, false);

    // B can still complete its job.
    const completedByB = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.markCompleted({ jobId: "job:lease:2", workerId: "worker-b", now: "2026-08-12T03:00:34.000Z" }));
    assert.equal(completedByB, true);

    const job = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.get("job:lease:2"));
    assert.equal(job?.status, "completed");
    assert.doesNotMatch(job?.lastError ?? "", /stale worker error/);
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});

test("V2 maintenance job dedupe key prevents duplicate job creation", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);
    await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:dedupe",
      name: "Dedupe World",
    })));
    await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:dedupe",
      storyWorldId: "world:dedupe",
      primaryCharacterId: "character:one",
    })));

    const job = await unit.withChatTransaction(async ({ maintenanceJobs }) => maintenanceJobs.enqueue({
      jobId: "job:dedupe:1",
      conversationId: "conversation:dedupe" as never,
      jobType: "story_analyze",
      status: "pending",
      payload: { conversationId: "conversation:dedupe" as never, sourceMessageIds: [] },
      dedupeKey: "story_analyze:conversation:dedupe:key-1",
      attempts: 0,
      maxAttempts: 3,
      availableAt: "2026-08-12T03:00:00.000Z",
    }));
    assert.equal(job.dedupeKey, "story_analyze:conversation:dedupe:key-1");

    const found = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.findJobByDedupeKey("story_analyze", "story_analyze:conversation:dedupe:key-1"));
    assert.equal(found?.jobId, "job:dedupe:1");

    const differentKey = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.findJobByDedupeKey("story_analyze", "story_analyze:conversation:dedupe:other-key"));
    assert.equal(differentKey, undefined);
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});
