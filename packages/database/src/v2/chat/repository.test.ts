import assert from "node:assert/strict";
import test from "node:test";

import { createV2CanonCharacter, createV2CanonWorld, createV2ChatConversation, createV2ChatMaintenanceJob, createV2ChatMessage, createV2ChatMedia, createV2ChatSticker, createV2Memory } from "@living-network/domain/v2";

import { applyV2Migrations, openV2TempSqliteConnection } from "../platform/index.ts";
import { V2SqliteChatMaintenanceJobRepository, V2SqliteChatUnitOfWork, V2SqliteMemoryRepository } from "./repository.ts";

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
      scopeType: "conversation",
      scopeId: "conversation:one",
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

test("V2 chat repository exposes conversation summaries and character-scoped memory", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);

    await unit.withChatTransaction(async ({ canon }) => {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world:summary", name: "Summary World" }));
      await canon.createCharacter(createV2CanonCharacter({
        storyWorldId: "world:summary",
        characterId: "character:summary",
        name: "花火",
        summary: "嘴硬心软",
      }));
    });

    await unit.withChatTransaction(async ({ conversations, messages }) => {
      await conversations.create(createV2ChatConversation({
        conversationId: "conversation:summary",
        storyWorldId: "world:summary",
        primaryCharacterId: "character:summary",
        title: "花火",
      }));
      await messages.create(createV2ChatMessage({
        messageId: "message:summary",
        conversationId: "conversation:summary",
        role: "assistant",
        text: "这么晚才来？",
        idempotencyKey: "summary:key",
      }));
    });

    const summaries = await unit.withChatTransaction(async ({ conversations }) => conversations.listSummaries());
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.characterName, "花火");
    assert.equal(summaries[0]?.storyWorldName, "Summary World");
    assert.equal(summaries[0]?.lastMessagePreview, "这么晚才来？");

    await unit.withChatTransaction(async ({ memories }) => {
      await memories.create(createV2Memory({
        memoryId: "memory:summary",
        scopeType: "character",
      scopeId: "character:summary",
      storyWorldId: "world:summary",
        characterId: "character:summary",
        kind: "profile",
        content: "花火记得用户的名字",
        importance: 0.7,
        confidence: 0.9,
        sourceMessageIds: ["message:summary"],
      }));
    });

    const count = await unit.withChatTransaction(async ({ memories }) => memories.countActiveByCharacter({
      storyWorldId: "world:summary" as never,
      characterId: "character:summary",
    }));
    assert.equal(count, 1);
    const recent = await unit.withChatTransaction(async ({ memories }) => memories.listActiveByCharacter({
      storyWorldId: "world:summary" as never,
      characterId: "character:summary",
      limit: 5,
    }));
    assert.equal(recent.length, 1);
    assert.equal(recent[0]?.content, "花火记得用户的名字");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});

test("V2 chat repository persists stickers ordered by recent use", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);

    await unit.withChatTransaction(async ({ media }) => {
      await media.create(createV2ChatMedia({
        mediaId: "media:sticker",
        contentHash: "a".repeat(64),
        mediaRef: "media://local/v2/chat/a.png",
        mimeType: "image/png",
        byteSize: 10,
      }));
    });

    const first = await unit.withChatTransaction(async ({ stickers }) =>
      stickers.create(createV2ChatSticker({ stickerId: "sticker:one", mediaId: "media:sticker", mediaRef: "media://local/v2/chat/a.png", label: "开心", createdAt: "2026-08-20T00:00:00.000Z" })));
    assert.equal(first.label, "开心");
    await unit.withChatTransaction(async ({ stickers }) =>
      stickers.create(createV2ChatSticker({ stickerId: "sticker:two", mediaId: "media:sticker", mediaRef: "media://local/v2/chat/a.png", label: "加油", createdAt: "2026-08-20T00:00:00.000Z" })));

    await unit.withChatTransaction(async ({ stickers }) => stickers.touchLastUsed({ stickerId: "sticker:one", lastUsedAt: "2026-08-21T00:00:00.000Z" }));
    const list = await unit.withChatTransaction(async ({ stickers }) => stickers.list());
    assert.equal(list.length, 2);
    assert.equal(list[0]?.stickerId, "sticker:one");
    assert.equal(list[0]?.lastUsedAt, "2026-08-21T00:00:00.000Z");
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


test("V2 memory fact stats and maintenance run queries support the operational dashboard", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const memories = new V2SqliteMemoryRepository(temp.db);
    const jobs = new V2SqliteChatMaintenanceJobRepository(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);

    await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:stats",
      name: "Stats World",
    })));
    await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:stats",
      storyWorldId: "world:stats",
      primaryCharacterId: "character:stats",
      title: "Stats",
    })));

    // Empty stats
    const empty = memories.getMemoryFactStats();
    assert.equal(empty.total, 0);
    assert.equal(empty.averageImportance, 0);
    assert.equal(empty.averageConfidence, 0);
    assert.deepEqual(empty.typeDistribution, []);

    await memories.create(createV2Memory({
      memoryId: "memory:stats:1",
      scopeType: "character",
      scopeId: "character:a",
      storyWorldId: "world:stats",
      conversationId: "conversation:stats",
      characterId: "character:a",
      kind: "profile",
      content: "用户喜欢猫",
      importance: 0.8,
      confidence: 0.9,
      sourceMessageIds: [],
    }));
    await memories.create(createV2Memory({
      memoryId: "memory:stats:2",
      scopeType: "character",
      scopeId: "character:b",
      storyWorldId: "world:stats",
      conversationId: "conversation:stats",
      characterId: "character:b",
      kind: "world_fact",
      content: "世界存在魔法",
      importance: 0.6,
      confidence: 0.7,
      sourceMessageIds: [],
    }));
    await memories.create(createV2Memory({
      memoryId: "memory:stats:3",
      scopeType: "conversation",
      scopeId: "conversation:stats",
      storyWorldId: "world:stats",
      conversationId: "conversation:stats",
      kind: "episodic",
      content: "无角色事件",
      importance: 0.3,
      confidence: 0.5,
      sourceMessageIds: [],
    }));
    await memories.create(createV2Memory({
      memoryId: "memory:stats:4",
      scopeType: "conversation",
      scopeId: "conversation:stats",
      storyWorldId: "world:stats",
      conversationId: "conversation:stats",
      kind: "episodic",
      content: "已取代事件",
      importance: 0.2,
      confidence: 0.4,
      sourceMessageIds: [],
      status: "superseded",
    }));

    const stats = memories.getMemoryFactStats();
    assert.equal(stats.total, 3);
    assert.equal(stats.typeDistribution.length, 3);
    assert.ok(stats.averageImportance > 0);
    assert.ok(stats.averageConfidence > 0);

    // Maintenance runs
    await jobs.enqueue(createV2ChatMaintenanceJob({
      jobId: "job:stats:1",
      conversationId: "conversation:stats",
      jobType: "memory_extract",
      status: "completed",
      payload: { jobType: "memory_extract", conversationId: "conversation:stats", sourceMessageIds: [] },
    }));
    await jobs.enqueue(createV2ChatMaintenanceJob({
      jobId: "job:stats:2",
      conversationId: "conversation:stats",
      jobType: "memory_extract",
      status: "failed",
      payload: { jobType: "memory_extract", conversationId: "conversation:stats", sourceMessageIds: [] },
      lastError: "extraction boom",
    }));

    const latestRun = jobs.getLatestRun("memory_extract");
    assert.equal(latestRun?.status, "failed");
    const latestFailure = jobs.getLatestFailure("memory_extract");
    assert.equal(latestFailure?.jobId, "job:stats:2");
    assert.equal(latestFailure?.lastError, "extraction boom");

    const failures = jobs.getRecentMemoryFailures(5);
    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.jobId, "job:stats:2");

    assert.equal(jobs.getLatestRun("memory_consolidate"), undefined);
    assert.equal(jobs.getLatestFailure("memory_consolidate"), undefined);
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});


test("manual retry grants a claimable execution for a terminal failed job", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);
    await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:retry",
      name: "Retry World",
    })));
    await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:retry",
      storyWorldId: "world:retry",
      primaryCharacterId: "character:one",
    })));

    // Terminal failed job: attempts exhausted.
    await unit.withChatTransaction(async ({ maintenanceJobs }) => maintenanceJobs.enqueue({
      jobId: "job:retry:1",
      conversationId: "conversation:retry" as never,
      jobType: "memory_extract",
      status: "failed",
      payload: { conversationId: "conversation:retry" as never, sourceMessageIds: [] },
      attempts: 3,
      maxAttempts: 3,
      availableAt: "2026-08-12T03:00:00.000Z",
      lastError: "boom",
    }));

    // Before fix: claimNext returns undefined because 3 < 3 is false.
    const before = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.claimNext({ workerId: "worker-r", leaseDurationMs: 30000, now: "2026-08-12T03:00:00.000Z" }));
    assert.equal(before, undefined, "terminal failed job must not be claimable before manual retry");

    // Manual retry.
    const retried = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.retryFailed({ jobId: "job:retry:1", now: "2026-08-12T03:00:01.000Z" }));
    assert.equal(retried?.status, "pending");
    assert.equal(retried?.attempts, 3, "attempt history must be preserved");
    assert.equal(retried?.maxAttempts, 4, "manual retry must grant one extra execution");

    // Now the worker can claim it.
    const claimed = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.claimNext({ workerId: "worker-r", leaseDurationMs: 30000, now: "2026-08-12T03:00:02.000Z" }));
    assert.equal(claimed?.jobId, "job:retry:1");
    assert.equal(claimed?.attempts, 4);
    assert.equal(claimed?.status, "claimed");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});

test("manual retry does not regrant unlimited executions and keeps maxAttempts bounded", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);
    await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:retry2",
      name: "Retry2 World",
    })));
    await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:retry2",
      storyWorldId: "world:retry2",
      primaryCharacterId: "character:one",
    })));
    await unit.withChatTransaction(async ({ maintenanceJobs }) => maintenanceJobs.enqueue({
      jobId: "job:retry:2",
      conversationId: "conversation:retry2" as never,
      jobType: "memory_extract",
      status: "failed",
      payload: { conversationId: "conversation:retry2" as never, sourceMessageIds: [] },
      attempts: 2,
      maxAttempts: 5,
      availableAt: "2026-08-12T03:00:00.000Z",
      lastError: "boom",
    }));

    // attempts(2) < maxAttempts(5): retry keeps maxAttempts unchanged.
    const retried = await unit.withChatTransaction(async ({ maintenanceJobs }) =>
      maintenanceJobs.retryFailed({ jobId: "job:retry:2", now: "2026-08-12T03:00:01.000Z" }));
    assert.equal(retried?.maxAttempts, 5, "maxAttempts must not regress when it is already sufficient");
    assert.equal(retried?.status, "pending");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});


test("V2 memory scoped retrieval honors the full scope matrix", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);
    await unit.withChatTransaction(async (repos) => {
      await repos.canon.createWorld(createV2CanonWorld({ storyWorldId: "world:matrix", name: "M" }));
      await repos.canon.createCharacter(createV2CanonCharacter({ characterId: "character:a", storyWorldId: "world:matrix", name: "A" }));
      await repos.canon.createCharacter(createV2CanonCharacter({ characterId: "character:b", storyWorldId: "world:matrix", name: "B" }));
      await repos.conversations.create(createV2ChatConversation({ conversationId: "conversation:a", storyWorldId: "world:matrix", primaryCharacterId: "character:a", title: "A" }));
      await repos.conversations.create(createV2ChatConversation({ conversationId: "conversation:b", storyWorldId: "world:matrix", primaryCharacterId: "character:b", title: "B" }));
      const nowIso = new Date().toISOString();
      const seed = (id: string, scopeType: "user" | "world" | "character" | "conversation", scopeId: string, characterId?: string, conversationId?: string) => repos.memories.create(createV2Memory({
        memoryId: id,
        storyWorldId: "world:matrix" as never,
        ...(conversationId === undefined ? {} : { conversationId: conversationId as never }),
        ...(characterId === undefined ? {} : { characterId }),
        scopeType,
        scopeId,
        kind: "profile",
        content: "矩阵测试内容",
        importance: 0.8,
        confidence: 0.9,
        sourceMessageIds: [],
        status: "active",
        createdAt: nowIso,
        updatedAt: nowIso,
      }));
      await seed("mem:user", "user", "user:local");
      await seed("mem:world", "world", "world:matrix");
      await seed("mem:char-a", "character", "character:a", "character:a", "conversation:a");
      await seed("mem:char-b", "character", "character:b", "character:b", "conversation:b");
      await seed("mem:conv-a", "conversation", "conversation:a", undefined, "conversation:a");
      await seed("mem:conv-b", "conversation", "conversation:b", undefined, "conversation:b");
    });
    const forA = await unit.withChatTransaction(async (repos) => repos.memories.listActiveScoped({ storyWorldId: "world:matrix" as never, conversationId: "conversation:a" as never, characterId: "character:a", limit: 20 }));
    const aIds = forA.map((m) => m.memoryId).sort();
    assert.deepEqual(aIds, ["mem:char-a", "mem:conv-a", "mem:user", "mem:world"].sort());
    const forB = await unit.withChatTransaction(async (repos) => repos.memories.listActiveScoped({ storyWorldId: "world:matrix" as never, conversationId: "conversation:b" as never, characterId: "character:b", limit: 20 }));
    const bIds = forB.map((m) => m.memoryId).sort();
    assert.deepEqual(bIds, ["mem:char-b", "mem:conv-b", "mem:user", "mem:world"].sort());
    const aOnly = await unit.withChatTransaction(async (repos) => repos.memories.listActiveScoped({ storyWorldId: "world:matrix" as never, conversationId: "conversation:a" as never, characterId: "character:a", limit: 20 }));
    assert.ok(aOnly.every((m) => !["mem:char-b", "mem:conv-b"].includes(m.memoryId)), "A must not see B scope memories");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});
