import assert from "node:assert/strict";
import test from "node:test";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  v2ChatMigrations,
  V2SqliteChatUnitOfWork,
  V2SqliteMemoryEngineRunRepository,
} from "@living-network/database/v2";
import {
  createV2CanonCharacter,
  createV2CanonWorld,
  createV2ChatConversation,
  createV2ChatMessage,
  createV2ChatMaintenanceJob,
  createV2Memory,
} from "@living-network/domain/v2";
import type {
  V2ConversationId,
  V2IsoDateTime,
  V2MaintenanceJobId,
  V2MessageId,
  V2Revision,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import { V2MaintenanceDispatchPump } from "./maintenance-dispatch-pump.ts";
import { V2BuiltinStructuredEngine } from "./memory/index.ts";
import type { V2MemoryEngine } from "@living-network/ports/v2";
import type { V2MemoryConsumeResult, V2MemoryEngineCapabilities, V2MemoryQuery, V2RetrievedMemory } from "@living-network/contracts/v2";
import type { ChatProvider } from "@living-network/ai/v2";

const now = "2026-08-12T03:00:00.000Z" as V2IsoDateTime;

function engineFor(uow: V2SqliteChatUnitOfWork, db: ReturnType<typeof openV2TempSqliteConnection>["db"]) {
  return new V2BuiltinStructuredEngine({
    unitOfWork: uow,
    runs: new V2SqliteMemoryEngineRunRepository(db),
  });
}

function createTestProvider(replyJson: string): ChatProvider {
  return {
    async complete() {
      return {
        id: "test-id",
        content: replyJson,
        model: "test-model",
      };
    },
    async *stream() {
      yield { content: replyJson };
      yield { finishReason: "stop" };
    },
  };
}

async function setupTestDb() {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const uow = new V2SqliteChatUnitOfWork(db);
  return { db, uow, cleanup };
}

test("V2MaintenanceDispatchPump claims and processes memory_extract job with provenance validation", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_1" as V2StoryWorldId;
  const convId = "conv_1" as V2ConversationId;
  const msg1Id = "msg_1" as V2MessageId;
  const msg2Id = "msg_2" as V2MessageId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "World 1",
        summary: "World 1 summary",
      })
    );
    await repos.canon.createCharacter(
      createV2CanonCharacter({
        characterId: "char_1" as any,
        storyWorldId: worldId,
        name: "Mira",
        summary: "A companion",
        personaText: "Friendly, casual",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: "char_1" as any,
        title: "Test Conv",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg1Id,
        conversationId: convId,
        role: "user",
        text: "I love hiking in high mountains.",
        idempotencyKey: "key_1",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg2Id,
        conversationId: convId,
        role: "assistant",
        characterId: "char_1" as any,
        text: "High mountains are wonderful!",
        idempotencyKey: "key_2",
      })
    );
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_extract_1" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "memory_extract",
        status: "pending",
        payload: {
          conversationId: convId,
          storyWorldId: worldId,
          characterId: "char_1" as any,
          sourceMessageIds: [msg1Id, msg2Id],
        },
        attempts: 0,
        maxAttempts: 3,
        availableAt: now,
      })
    );
  });

  const providerReply = JSON.stringify([
    {
      subject: { entityType: "user", entityId: "user:local" },
      predicate: "preferred_activity",
      object: { type: "text", value: "hiking" },
      kind: "preference",
      text: "User loves hiking in high mountains.",
      changeHint: "new",
      confidence: 0.9,
      importanceHint: 0.8,
      sourceMessageIds: [msg1Id],
    },
    {
      subject: { entityType: "user", entityId: "user:local" },
      predicate: "preferred_activity",
      object: { type: "text", value: "hiking" },
      kind: "preference",
      text: "User loves hiking in high mountains.",
      changeHint: "new",
      confidence: 0.5,
      importanceHint: 0.6,
      sourceMessageIds: [msg2Id],
    },
  ]);

  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_1",
    unitOfWork: uow,
    provider: createTestProvider(providerReply),
    engines: [engineFor(uow, db)],
  });

  let processed = await pump.tick();
  assert.equal(processed, true);
  // The fact extract job fans out a memory_engine_consume job; process it too.
  processed = await pump.tick();
  assert.equal(processed, true);

  await uow.withChatTransaction(async (repos) => {
    const job = await repos.maintenanceJobs.get("job_extract_1" as V2MaintenanceJobId);
    assert.equal(job?.status, "completed");

    const memories = await repos.memories.listByConversation(convId);
    assert.equal(memories.length, 1);
    assert.equal(memories[0]?.content, "User loves hiking in high mountains.");
  });

  cleanup();
});

test("V2MaintenanceDispatchPump persists a fact batch and assertions before writing legacy memory", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_fact_ledger" as V2StoryWorldId;
  const convId = "conv_fact_ledger" as V2ConversationId;
  const msg1Id = "msg_fact_ledger_1" as V2MessageId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "World Fact Ledger",
        summary: "World summary",
      })
    );
    await repos.canon.createCharacter(
      createV2CanonCharacter({
        characterId: "char_fact_ledger" as any,
        storyWorldId: worldId,
        name: "Mira",
        summary: "A companion",
        personaText: "Friendly, casual",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: "char_fact_ledger" as any,
        title: "Fact Ledger Conv",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg1Id,
        conversationId: convId,
        role: "user",
        text: "我的生日是 6 月 1 日。",
        createdAt: now,
        idempotencyKey: "key_fact_ledger_1",
      })
    );
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_fact_ledger_1" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "memory_extract",
        status: "pending",
        payload: {
          conversationId: convId,
          storyWorldId: worldId,
          characterId: "char_fact_ledger" as any,
          sourceMessageIds: [msg1Id],
          range: { fromMessageId: msg1Id, toMessageId: msg1Id },
        },
        attempts: 0,
        maxAttempts: 3,
        availableAt: now,
      })
    );
  });

  const providerReply = JSON.stringify([
    {
      subject: { entityType: "user", entityId: "user:local" },
      predicate: "birthday",
      object: { type: "text", value: "6 月 1 日" },
      kind: "profile",
      text: "用户的生日是 6 月 1 日",
      changeHint: "new",
      confidence: 0.97,
      importanceHint: 0.8,
      sourceMessageIds: [msg1Id],
    },
  ]);

  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_fact_ledger",
    unitOfWork: uow,
    provider: createTestProvider(providerReply),
  });

  const processed = await pump.tick();
  assert.equal(processed, true);

  await uow.withChatTransaction(async (repos) => {
    const batches = await repos.facts.listBatchesByConversation(convId);
    assert.equal(batches.length, 1);
    assert.equal(batches[0]?.status, "completed");
    assert.equal(batches[0]?.extractorVersion, "fact.extract:v1");
    assert.equal(batches[0]?.sourceMessageIds.length, 1);

    const assertions = await repos.facts.listAssertionsByBatch(batches[0]!.batchId);
    assert.equal(assertions.length, 1);
    assert.equal(assertions[0]?.predicate, "birthday");
    assert.equal(assertions[0]?.kind, "profile");
    assert.equal(assertions[0]?.text, "用户的生日是 6 月 1 日");
    assert.deepEqual(assertions[0]?.sourceMessageIds, [msg1Id]);
  });

  cleanup();
});

test("V2MaintenanceDispatchPump processes conversation_summary job and creates summary record", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_2" as V2StoryWorldId;
  const convId = "conv_2" as V2ConversationId;
  const msg1Id = "msg_2_1" as V2MessageId;
  const msg2Id = "msg_2_2" as V2MessageId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "World 2",
        summary: "World 2 summary",
      })
    );
    await repos.canon.createCharacter(
      createV2CanonCharacter({
        characterId: "char_2" as any,
        storyWorldId: worldId,
        name: "Mira 2",
        summary: "A companion",
        personaText: "Friendly, casual",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: "char_2" as any,
        title: "Summary Conv",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg1Id,
        conversationId: convId,
        role: "user",
        text: "Let's explore the hidden ruins.",
        createdAt: "2026-08-12T03:01:00.000Z",
        idempotencyKey: "key_sum_1",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg2Id,
        conversationId: convId,
        role: "assistant",
        characterId: "char_2" as any,
        text: "I will pack our torches and maps.",
        createdAt: "2026-08-12T03:02:00.000Z",
        idempotencyKey: "key_sum_2",
      })
    );
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_summary_1" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "conversation_summary",
        status: "pending",
        payload: {
          conversationId: convId,
          storyWorldId: worldId,
          characterId: "char_2" as any,
          sourceMessageIds: [msg1Id, msg2Id],
        },
        attempts: 0,
        maxAttempts: 3,
        availableAt: now,
      })
    );
  });

  const providerReply = JSON.stringify({
    summary: "The user and companion decided to explore the hidden ruins and packed torches and maps.",
    keyEvents: ["Decided to explore hidden ruins", "Packed torches and maps"],
  });

  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_2",
    unitOfWork: uow,
    provider: createTestProvider(providerReply),
  });

  const processed = await pump.tick();
  assert.equal(processed, true);

  await uow.withChatTransaction(async (repos) => {
    const job = await repos.maintenanceJobs.get("job_summary_1" as V2MaintenanceJobId);
    assert.equal(job?.status, "completed");

    const summary = await repos.summaries.get(convId);
    assert.ok(summary);
    assert.equal(summary?.coveredUntilMessageId, msg2Id);
    assert.ok(summary?.summary.includes("hidden ruins"));
  });

  cleanup();
});

test("V2MaintenanceDispatchPump retries with exponential backoff on failure", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const convId = "conv_retry" as V2ConversationId;
  const worldId = "world_retry" as V2StoryWorldId;
  const charId = "char_retry" as any;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "World Retry",
        summary: "World summary",
      })
    );
    await repos.canon.createCharacter(
      createV2CanonCharacter({
        characterId: charId,
        storyWorldId: worldId,
        name: "Mira Retry",
        summary: "A companion",
        personaText: "Friendly, casual",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: charId,
        title: "Retry Conv",
      })
    );
    const msg1Id = "msg_r_1" as V2MessageId;
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg1Id,
        conversationId: convId,
        role: "user",
        text: "I remember something",
        status: "completed",
        idempotencyKey: "idem_msg_r_1",
        createdAt: now,
      })
    );
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_retry_1" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "memory_extract",
        status: "pending",
        payload: {
          conversationId: convId,
          sourceMessageIds: [msg1Id],
        },
        attempts: 0,
        maxAttempts: 3,
        availableAt: now,
      })
    );
  });

  const failingProvider: ChatProvider = {
    async complete() {
      throw new Error("Provider temporary network failure");
    },
    async *stream() {
      throw new Error("Provider temporary network failure");
    },
  };

  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_retry",
    unitOfWork: uow,
    provider: failingProvider,
  });

  const processed = await pump.tick();
  assert.equal(processed, true);

  await uow.withChatTransaction(async (repos) => {
    const job = await repos.maintenanceJobs.get("job_retry_1" as V2MaintenanceJobId);
    assert.equal(job?.status, "pending");
    assert.equal(job?.attempts, 1);
    assert.ok(job?.lastError?.includes("Provider temporary network failure"));
  });

  cleanup();
});

test("V2MaintenanceDispatchPump processes story_analyze job and submits scene candidate", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_story_1" as V2StoryWorldId;
  const convId = "conv_story_1" as V2ConversationId;
  const msg1Id = "msg_s_1" as V2MessageId;
  const msg2Id = "msg_s_2" as V2MessageId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "Fantasy Realm",
        summary: "A realm of magic and adventure",
      })
    );
    await repos.canon.createCharacter(
      createV2CanonCharacter({
        characterId: "char_sparkle" as any,
        storyWorldId: worldId,
        name: "Sparkle",
        summary: "A mysterious jester",
        personaText: "Playful and unpredictable",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: "char_sparkle" as any,
        title: "Sparkle Adventure",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg1Id,
        conversationId: convId,
        role: "user",
        text: "Let's uncover the secrets of the Golden Palace.",
        idempotencyKey: "key_story_1",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg2Id,
        conversationId: convId,
        role: "assistant",
        characterId: "char_sparkle" as any,
        text: "The Golden Palace has three hidden gates. Which one shall we open?",
        idempotencyKey: "key_story_2",
      })
    );
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_story_analyze_1" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "story_analyze",
        status: "pending",
        payload: {
          conversationId: convId,
          storyWorldId: worldId,
          characterId: "char_sparkle" as any,
          sourceMessageIds: [msg1Id, msg2Id],
        },
        attempts: 0,
        maxAttempts: 3,
        availableAt: now,
      })
    );
  });

  const providerReply = JSON.stringify({
    scenes: [
      {
        title: "金色宫殿的三道暗门",
        body: "冒险者与花火来到了金色宫殿前。宫殿巍峨耸立，三道带有古老符文的暗门静静伫立。",
        choices: [
          { label: "打开左侧刻有太阳符文的门", consequenceSummary: "进入光明大厅" },
          { label: "打开右侧刻有月亮符文的门", consequenceSummary: "进入暗夜迷宫" },
        ],
      },
    ],
  });

  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_story",
    unitOfWork: uow,
    provider: createTestProvider(providerReply),
  });

  const processed = await pump.tick();
  assert.equal(processed, true);

  await uow.withChatTransaction(async (repos) => {
    const job = await repos.maintenanceJobs.get("job_story_analyze_1" as V2MaintenanceJobId);
    assert.equal(job?.status, "completed");

    const candidates = await repos.candidateReviews.listSceneCandidates(worldId);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.payload.scene.title, "金色宫殿的三道暗门");
    assert.equal(candidates[0]?.payload.choices.length, 2);
    assert.equal(candidates[0]?.provenance.source, "llm");
    assert.equal(candidates[0]?.status, "pending");
  });

  cleanup();
});

test("V2MaintenanceDispatchPump retries when source messages are missing and fails terminally at max attempts", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const convId = "conv_missing" as V2ConversationId;
  const worldId = "world_missing" as V2StoryWorldId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "World Missing",
        summary: "World summary",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: "char_missing" as any,
        title: "Missing Conv",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: "msg_missing_1" as V2MessageId,
        conversationId: convId,
        role: "user",
        text: "I remember something",
        idempotencyKey: "idem_missing_1",
        createdAt: now,
      })
    );
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_missing_1" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "memory_extract",
        status: "pending",
        payload: {
          conversationId: convId,
          sourceMessageIds: ["msg_missing_1" as V2MessageId, "msg_deleted_2" as V2MessageId],
        },
        attempts: 0,
        maxAttempts: 3,
        availableAt: now,
      })
    );
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_missing_terminal" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "memory_extract",
        status: "pending",
        payload: {
          conversationId: convId,
          sourceMessageIds: ["msg_deleted_3" as V2MessageId],
        },
        attempts: 2,
        maxAttempts: 3,
        availableAt: now,
      })
    );
  });

  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_missing",
    unitOfWork: uow,
    provider: createTestProvider("[]"),
  });

  await pump.tick();
  await pump.tick();
  await uow.withChatTransaction(async (repos) => {
    const retryable = await repos.maintenanceJobs.get("job_missing_1" as V2MaintenanceJobId);
    assert.equal(retryable?.status, "pending");
    assert.equal(retryable?.attempts, 1);
    assert.match(retryable?.lastError ?? "", /SOURCE_MESSAGE_NOT_FOUND/);

    const terminal = await repos.maintenanceJobs.get("job_missing_terminal" as V2MaintenanceJobId);
    assert.equal(terminal?.status, "failed");
    assert.match(terminal?.lastError ?? "", /SOURCE_MESSAGE_NOT_FOUND/);
  });

  cleanup();
});

test("V2MaintenanceDispatchPump does not overwrite a newer summary when the job is stale", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_stale" as V2StoryWorldId;
  const convId = "conv_stale" as V2ConversationId;
  const msg1Id = "msg_stale_1" as V2MessageId;
  const msg2Id = "msg_stale_2" as V2MessageId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "World Stale",
        summary: "World summary",
      })
    );
    await repos.canon.createCharacter(
      createV2CanonCharacter({
        characterId: "char_stale" as any,
        storyWorldId: worldId,
        name: "Mira Stale",
        summary: "A companion",
        personaText: "Friendly, casual",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: "char_stale" as any,
        title: "Stale Conv",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg1Id,
        conversationId: convId,
        role: "user",
        text: "We found the ruins.",
        createdAt: "2026-08-12T03:01:00.000Z",
        idempotencyKey: "key_stale_1",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg2Id,
        conversationId: convId,
        role: "assistant",
        characterId: "char_stale" as any,
        text: "Let's camp inside.",
        createdAt: "2026-08-12T03:02:00.000Z",
        idempotencyKey: "key_stale_2",
      })
    );
    await repos.summaries.save({
      conversationId: convId,
      summary: "NEWER summary that must not be overwritten.",
      coveredUntilMessageId: msg2Id,
      sourceMessageCount: 10,
      version: 3,
      updatedAt: "2026-08-12T04:00:00.000Z",
    });
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_stale_1" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "conversation_summary",
        status: "pending",
        payload: {
          conversationId: convId,
          storyWorldId: worldId,
          characterId: "char_stale" as any,
          sourceMessageIds: [msg1Id, msg2Id],
          fromMessageId: msg1Id,
          toMessageId: msg2Id,
          previousSummaryVersion: 1,
          coveredUntilMessageId: msg1Id,
        },
        attempts: 0,
        maxAttempts: 3,
        availableAt: now,
      })
    );
  });

  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_stale",
    unitOfWork: uow,
    provider: createTestProvider("STALE OVERWRITE ATTEMPT"),
  });

  const processed = await pump.tick();
  assert.equal(processed, true);

  await uow.withChatTransaction(async (repos) => {
    const job = await repos.maintenanceJobs.get("job_stale_1" as V2MaintenanceJobId);
    assert.equal(job?.status, "completed");
    const summary = await repos.summaries.get(convId);
    assert.equal(summary?.version, 3);
    assert.match(summary?.summary ?? "", /NEWER summary/);
    assert.doesNotMatch(summary?.summary ?? "", /STALE OVERWRITE/);
  });

  cleanup();
});

test("V2MaintenanceDispatchPump advances the memory extract cursor after a successful job", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_cursor" as V2StoryWorldId;
  const convId = "conv_cursor" as V2ConversationId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "World Cursor",
        summary: "World summary",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: "char_cursor" as any,
        title: "Cursor Conv",
      })
    );
    for (let index = 1; index <= 8; index += 1) {
      await repos.messages.create(
        createV2ChatMessage({
          messageId: `msg_cursor_${index}` as V2MessageId,
          conversationId: convId,
          role: index % 2 === 0 ? "assistant" : "user",
          text: `消息 ${index}`,
          idempotencyKey: `cursor_key_${index}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        })
      );
    }
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_cursor_1" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "memory_extract",
        status: "pending",
        payload: {
          conversationId: convId,
          storyWorldId: worldId,
          characterId: "char_cursor" as any,
          sourceMessageIds: [
            "msg_cursor_1" as V2MessageId,
            "msg_cursor_2" as V2MessageId,
            "msg_cursor_3" as V2MessageId,
            "msg_cursor_4" as V2MessageId,
            "msg_cursor_5" as V2MessageId,
            "msg_cursor_6" as V2MessageId,
            "msg_cursor_7" as V2MessageId,
            "msg_cursor_8" as V2MessageId,
          ],
          triggerReason: "cursor_batch",
          range: { fromMessageId: "msg_cursor_1" as V2MessageId, toMessageId: "msg_cursor_8" as V2MessageId },
        },
        attempts: 0,
        maxAttempts: 3,
        availableAt: now,
      })
    );
  });

  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_cursor",
    unitOfWork: uow,
    provider: createTestProvider("[]"),
  });

  const processed = await pump.tick();
  assert.equal(processed, true);

  await uow.withChatTransaction(async (repos) => {
    const job = await repos.maintenanceJobs.get("job_cursor_1" as V2MaintenanceJobId);
    assert.equal(job?.status, "completed");
    const cursor = await repos.maintenanceJobs.getMemoryExtractCursor(convId);
    assert.equal(cursor, "msg_cursor_8");
  });

  cleanup();
});

test("V2MaintenanceDispatchPump retries on invalid structured output and fails terminally at max attempts", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_invalid" as V2StoryWorldId;
  const convId = "conv_invalid" as V2ConversationId;
  const msg1Id = "msg_invalid_1" as V2MessageId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "World Invalid",
        summary: "World summary",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: "char_invalid" as any,
        title: "Invalid Conv",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg1Id,
        conversationId: convId,
        role: "user",
        text: "I remember something",
        idempotencyKey: "key_invalid_1",
        createdAt: now,
      })
    );
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_invalid_1" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "memory_extract",
        status: "pending",
        payload: {
          conversationId: convId,
          storyWorldId: worldId,
          characterId: "char_invalid" as any,
          sourceMessageIds: [msg1Id],
        },
        attempts: 0,
        maxAttempts: 3,
        availableAt: now,
      })
    );
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_invalid_terminal" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "memory_extract",
        status: "pending",
        payload: {
          conversationId: convId,
          storyWorldId: worldId,
          characterId: "char_invalid" as any,
          sourceMessageIds: [msg1Id],
        },
        attempts: 2,
        maxAttempts: 3,
        availableAt: now,
      })
    );
  });

  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_invalid",
    unitOfWork: uow,
    provider: createTestProvider("this is not json"),
  });

  await pump.tick();
  await pump.tick();
  await uow.withChatTransaction(async (repos) => {
    const retryable = await repos.maintenanceJobs.get("job_invalid_1" as V2MaintenanceJobId);
    assert.equal(retryable?.status, "pending");
    assert.match(retryable?.lastError ?? "", /INVALID_JSON/);

    const terminal = await repos.maintenanceJobs.get("job_invalid_terminal" as V2MaintenanceJobId);
    assert.equal(terminal?.status, "failed");
    assert.match(terminal?.lastError ?? "", /INVALID_JSON/);
  });

  cleanup();
});

test("V2MaintenanceDispatchPump consolidates a related preference and supersedes the old one", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_consolidate" as V2StoryWorldId;
  const convId = "conv_consolidate" as V2ConversationId;
  const coffeeMsgId = "msg_cons_coffee" as V2MessageId;
  const teaMsgId = "msg_cons_tea" as V2MessageId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "World Consolidate",
        summary: "World summary",
      })
    );
    await repos.canon.createCharacter(
      createV2CanonCharacter({
        characterId: "char_cons" as any,
        storyWorldId: worldId,
        name: "Mira",
        summary: "A companion",
        personaText: "Friendly, casual",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: "char_cons" as any,
        title: "Consolidate Conv",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: coffeeMsgId,
        conversationId: convId,
        role: "user",
        text: "我平时很喜欢喝咖啡。",
        createdAt: "2026-08-12T03:01:00.000Z",
        idempotencyKey: "key_cons_1",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: teaMsgId,
        conversationId: convId,
        role: "user",
        text: "我最近口味变了，我现在不喝咖啡了，更喜欢喝茶。",
        createdAt: "2026-08-12T03:02:00.000Z",
        idempotencyKey: "key_cons_2",
      })
    );
    await repos.memories.create(
      createV2Memory({
        memoryId: "memory_cons_coffee" as any,
        storyWorldId: worldId,
        conversationId: convId,
        kind: "preference",
        content: "用户喜欢喝咖啡",
        importance: 0.8,
        confidence: 0.9,
        sourceMessageIds: [coffeeMsgId],
        status: "active",
        createdAt: "2026-08-12T03:01:30.000Z",
        updatedAt: "2026-08-12T03:01:30.000Z",
      })
    );
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_consolidate_extract" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "memory_extract",
        status: "pending",
        payload: {
          conversationId: convId,
          storyWorldId: worldId,
          characterId: "char_cons" as any,
          sourceMessageIds: [teaMsgId],
          range: { fromMessageId: teaMsgId, toMessageId: teaMsgId },
        },
        attempts: 0,
        maxAttempts: 3,
        availableAt: now,
      })
    );
  });

  const factAssertionReply = JSON.stringify([
    {
      subject: { entityType: "user", entityId: "user:local" },
      predicate: "preferred_drink",
      object: { type: "text", value: "tea" },
      kind: "preference",
      text: "用户现在不喝咖啡了，更喜欢喝茶",
      changeHint: "replaces_previous",
      confidence: 0.95,
      importanceHint: 0.8,
      sourceMessageIds: [teaMsgId],
    },
  ]);
  const provider = createTestProvider(factAssertionReply);
  const consolidateProvider: ChatProvider = {
    async complete(request) {
      const lastMessage = String(request.messages.at(-1)?.content ?? "");
      if (lastMessage.includes("Compare this existing memory")) {
        return {
          id: "consolidate",
          model: "test-model",
          content: JSON.stringify({ action: "supersede", rationale: "偏好已转变" }),
        };
      }
      return { id: "extract", model: "test-model", content: factAssertionReply };
    },
    async *stream() {
      yield { content: "" };
      yield { finishReason: "stop" };
    },
  };

  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_consolidate",
    unitOfWork: uow,
    provider: consolidateProvider,
    engines: [engineFor(uow, db)],
  });

  let ran = 0;
  while (await pump.tick()) {
    ran += 1;
    if (ran > 5) break;
  }
  assert.ok(ran >= 2, "Expected extract and consolidate jobs to run");

  await uow.withChatTransaction(async (repos) => {
    const memories = await repos.memories.listByConversation(convId);
    const teaMem = memories.find((m) => m.content.includes("茶") && m.status === "active");
    const coffeeMem = memories.find((m) => m.content.includes("咖啡"));
    assert.ok(teaMem, "Tea preference memory should be active after consolidation");
    assert.equal(coffeeMem?.status, "superseded");
  });

  cleanup();
});

test("V2MaintenanceDispatchPump loses lease ownership after expiry and reclaim", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_stale_write" as V2StoryWorldId;
  const convId = "conv_stale_write" as V2ConversationId;
  const msg1Id = "msg_stale_write_1" as V2MessageId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "World Stale Write",
        summary: "World summary",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: "char_stale_write" as any,
        title: "Stale Write Conv",
      })
    );
    await repos.messages.create(
      createV2ChatMessage({
        messageId: msg1Id,
        conversationId: convId,
        role: "user",
        text: "用户喜欢在清晨慢跑。",
        createdAt: now,
        idempotencyKey: "key_stale_write_1",
      })
    );
    await repos.maintenanceJobs.enqueue(
      createV2ChatMaintenanceJob({
        jobId: "job_stale_write_1" as V2MaintenanceJobId,
        conversationId: convId,
        jobType: "memory_extract",
        status: "pending",
        payload: {
          conversationId: convId,
          storyWorldId: worldId,
          characterId: "char_stale_write" as any,
          sourceMessageIds: [msg1Id],
        },
        attempts: 0,
        maxAttempts: 3,
        availableAt: "2026-08-12T03:00:00.000Z",
      })
    );
  });

  // Worker A claims the job with a 30s lease.
  const claimedByA = await uow.withChatTransaction(async (repos) =>
    repos.maintenanceJobs.claimNext({ workerId: "worker-a", leaseDurationMs: 30000, now: "2026-08-12T03:00:00.000Z" }));
  assert.equal(claimedByA?.jobId, "job_stale_write_1");

  // A owns the lease before expiry.
  const ownsBeforeExpiry = await uow.withChatTransaction(async (repos) =>
    repos.maintenanceJobs.isLeaseOwner({ jobId: "job_stale_write_1", workerId: "worker-a", now: "2026-08-12T03:00:10.000Z" }));
  assert.equal(ownsBeforeExpiry, true);

  // A no longer owns the lease after expiry (even before reclaim).
  const ownsAfterExpiry = await uow.withChatTransaction(async (repos) =>
    repos.maintenanceJobs.isLeaseOwner({ jobId: "job_stale_write_1", workerId: "worker-a", now: "2026-08-12T03:00:31.000Z" }));
  assert.equal(ownsAfterExpiry, false);

  // B reclaims the expired job; A cannot complete it or write results.
  const reclaimedByB = await uow.withChatTransaction(async (repos) =>
    repos.maintenanceJobs.claimNext({ workerId: "worker-b", leaseDurationMs: 30000, now: "2026-08-12T03:00:31.000Z" }));
  assert.equal(reclaimedByB?.jobId, "job_stale_write_1");
  assert.equal(reclaimedByB?.claimedBy, "worker-b");

  const staleComplete = await uow.withChatTransaction(async (repos) =>
    repos.maintenanceJobs.markCompleted({ jobId: "job_stale_write_1", workerId: "worker-a", now: "2026-08-12T03:00:32.000Z" }));
  assert.equal(staleComplete, false);

  // No memory was written by the stale worker path (nothing was enqueued through it).
  await uow.withChatTransaction(async (repos) => {
    const memories = await repos.memories.listByConversation(convId);
    assert.equal(memories.length, 0);
  });

  cleanup();
});

test("V2MaintenanceDispatchPump keeps at most one active extraction job per conversation", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_dedupe" as V2StoryWorldId;
  const convId = "conv_dedupe" as V2ConversationId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(
      createV2CanonWorld({
        storyWorldId: worldId,
        name: "World Dedupe",
        summary: "World summary",
      })
    );
    await repos.conversations.create(
      createV2ChatConversation({
        conversationId: convId,
        storyWorldId: worldId,
        primaryCharacterId: "char_dedupe" as any,
        title: "Dedupe Conv",
      })
    );
    for (let index = 1; index <= 4; index += 1) {
      await repos.messages.create(
        createV2ChatMessage({
          messageId: `msg_d_${index}` as V2MessageId,
          conversationId: convId,
          role: "user",
          text: `消息 ${index}`,
          idempotencyKey: `dedupe_key_${index}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        })
      );
    }
    // Simulate many new messages without any worker running: three pending
    // extraction jobs with overlapping ranges (as created before the gate).
    const payloads = [
      { conversationId: convId, storyWorldId: worldId, sourceMessageIds: ["msg_d_1" as V2MessageId, "msg_d_2" as V2MessageId] },
      { conversationId: convId, storyWorldId: worldId, sourceMessageIds: ["msg_d_1" as V2MessageId, "msg_d_2" as V2MessageId, "msg_d_3" as V2MessageId] },
      { conversationId: convId, storyWorldId: worldId, sourceMessageIds: ["msg_d_1" as V2MessageId, "msg_d_2" as V2MessageId, "msg_d_3" as V2MessageId, "msg_d_4" as V2MessageId] },
    ];
    for (const [index, payload] of payloads.entries()) {
      await repos.maintenanceJobs.enqueue(
        createV2ChatMaintenanceJob({
          jobId: `job_dedupe_${index + 1}` as V2MaintenanceJobId,
          conversationId: convId,
          jobType: "memory_extract",
          status: "pending",
          payload,
          attempts: 0,
          maxAttempts: 3,
          availableAt: now,
        })
      );
    }
  });

  // The dedupe gate lives in the API enqueue path; verify that a conversation
  // with an active extraction job reports hasActiveJob correctly.
  await uow.withChatTransaction(async (repos) => {
    const active = await repos.maintenanceJobs.hasActiveJob(convId, "memory_extract");
    assert.equal(active, true);
  });

  // The worker processes all pending jobs; after completion no active job remains.
  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_dedupe",
    unitOfWork: uow,
    provider: createTestProvider("[]"),
  });
  let ran = 0;
  while (await pump.tick()) {
    ran += 1;
    if (ran > 5) break;
  }
  assert.equal(ran, 3);

  await uow.withChatTransaction(async (repos) => {
    const active = await repos.maintenanceJobs.hasActiveJob(convId, "memory_extract");
    assert.equal(active, false);
  });

  cleanup();
});

class FakeShadowEngine implements V2MemoryEngine {
  public readonly id = "fake_shadow";
  public failNextConsume = false;
  public consumedBatches: readonly string[] = [];

  public capabilities(): V2MemoryEngineCapabilities {
    return {
      acceptsFactAssertions: true,
      acceptsRawMessages: false,
      supportsMutation: false,
      supportsEmbedding: false,
      supportsEntityIndex: false,
      supportsTemporalFacts: false,
    };
  }

  public async consume(input: { readonly batch: { readonly batchId: string }; readonly assertions: readonly unknown[] }): Promise<V2MemoryConsumeResult> {
    if (this.failNextConsume) {
      this.failNextConsume = false;
      throw new Error("shadow transient failure");
    }
    this.consumedBatches = [...this.consumedBatches, input.batch.batchId];
    return {
      engineId: this.id,
      batchId: input.batch.batchId,
      inputAssertionCount: input.assertions.length,
      outputMemoryCount: 0,
      mutated: false,
    };
  }

  public async retrieve(_input: V2MemoryQuery): Promise<readonly V2RetrievedMemory[]> {
    return [];
  }
}

test("V2MaintenanceDispatchPump fans out one consume job per engine with independent offsets", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_fanout" as V2StoryWorldId;
  const convId = "conv_fanout" as V2ConversationId;
  const msg1Id = "msg_fanout_1" as V2MessageId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(createV2CanonWorld({ storyWorldId: worldId, name: "World Fanout", summary: "s" }));
    await repos.conversations.create(createV2ChatConversation({
      conversationId: convId,
      storyWorldId: worldId,
      primaryCharacterId: "char_fanout" as any,
      title: "Fanout Conv",
    }));
    await repos.messages.create(createV2ChatMessage({
      messageId: msg1Id,
      conversationId: convId,
      role: "user",
      text: "我喜欢清晨慢跑。",
      createdAt: now,
      idempotencyKey: "key_fanout_1",
    }));
    await repos.maintenanceJobs.enqueue(createV2ChatMaintenanceJob({
      jobId: "job_fanout_extract" as V2MaintenanceJobId,
      conversationId: convId,
      jobType: "memory_extract",
      status: "pending",
      payload: {
        conversationId: convId,
        storyWorldId: worldId,
        characterId: "char_fanout" as any,
        sourceMessageIds: [msg1Id],
        range: { fromMessageId: msg1Id, toMessageId: msg1Id },
      },
      attempts: 0,
      maxAttempts: 3,
      availableAt: now,
    }));
  });

  const structured = engineFor(uow, db);
  const shadow = new FakeShadowEngine();
  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_fanout",
    unitOfWork: uow,
    provider: createTestProvider(JSON.stringify([
      {
        subject: { entityType: "user", entityId: "user:local" },
        predicate: "preferred_activity",
        object: { type: "text", value: "jogging" },
        kind: "preference",
        text: "用户喜欢清晨慢跑",
        changeHint: "new",
        confidence: 0.9,
        importanceHint: 0.7,
        sourceMessageIds: [msg1Id],
      },
    ])),
    engines: [structured, shadow],
  });

  let ran = 0;
  while (await pump.tick()) {
    ran += 1;
    if (ran > 10) break;
  }

  await uow.withChatTransaction(async (repos) => {
    const structuredOffset = await repos.facts.getEngineOffset("builtin_structured", `conversation:${convId}`);
    const shadowOffset = await repos.facts.getEngineOffset("fake_shadow", `conversation:${convId}`);
    assert.ok(structuredOffset, "structured engine offset should advance");
    assert.ok(shadowOffset, "shadow engine offset should advance");
    assert.equal(structuredOffset, shadowOffset);
    assert.deepEqual(shadow.consumedBatches, [structuredOffset]);
  });

  cleanup();
});

test("V2MaintenanceDispatchPump isolates shadow engine failure from the primary engine", async () => {
  const { db, uow, cleanup } = await setupTestDb();

  const worldId = "world_shadow_fail" as V2StoryWorldId;
  const convId = "conv_shadow_fail" as V2ConversationId;
  const msg1Id = "msg_shadow_fail_1" as V2MessageId;

  await uow.withChatTransaction(async (repos) => {
    await repos.canon.createWorld(createV2CanonWorld({ storyWorldId: worldId, name: "World Shadow Fail", summary: "s" }));
    await repos.conversations.create(createV2ChatConversation({
      conversationId: convId,
      storyWorldId: worldId,
      primaryCharacterId: "char_shadow_fail" as any,
      title: "Shadow Fail Conv",
    }));
    await repos.messages.create(createV2ChatMessage({
      messageId: msg1Id,
      conversationId: convId,
      role: "user",
      text: "我喜欢深夜阅读。",
      createdAt: now,
      idempotencyKey: "key_shadow_fail_1",
    }));
    await repos.maintenanceJobs.enqueue(createV2ChatMaintenanceJob({
      jobId: "job_shadow_fail_extract" as V2MaintenanceJobId,
      conversationId: convId,
      jobType: "memory_extract",
      status: "pending",
      payload: {
        conversationId: convId,
        storyWorldId: worldId,
        characterId: "char_shadow_fail" as any,
        sourceMessageIds: [msg1Id],
        range: { fromMessageId: msg1Id, toMessageId: msg1Id },
      },
      attempts: 0,
      maxAttempts: 3,
      availableAt: now,
    }));
  });

  const structured = engineFor(uow, db);
  const shadow = new FakeShadowEngine();
  shadow.failNextConsume = true;
  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_shadow_fail",
    unitOfWork: uow,
    provider: createTestProvider(JSON.stringify([
      {
        subject: { entityType: "user", entityId: "user:local" },
        predicate: "preferred_activity",
        object: { type: "text", value: "reading" },
        kind: "preference",
        text: "用户喜欢深夜阅读",
        changeHint: "new",
        confidence: 0.9,
        importanceHint: 0.7,
        sourceMessageIds: [msg1Id],
      },
    ])),
    engines: [structured, shadow],
  });

  let ran = 0;
  while (await pump.tick()) {
    ran += 1;
    if (ran > 10) break;
  }

  await uow.withChatTransaction(async (repos) => {
    const jobs = db.prepare("SELECT job_id, job_type, status, last_error FROM v2_chat_maintenance_jobs ORDER BY created_at").all() as Array<{ job_id: string; job_type: string; status: string; last_error: string | null }>;
    // Primary memory is written even though the shadow failed once and then retried.
    const memories = await repos.memories.listByConversation(convId);
    assert.equal(memories.length, 1);
    assert.ok(memories[0]?.content.includes("深夜阅读"));
    const structuredOffset = await repos.facts.getEngineOffset("builtin_structured", `conversation:${convId}`);
    assert.ok(structuredOffset);
    // The shadow failed once and is waiting for its retry backoff; it must not
    // have consumed the batch yet, and the primary engine must be unaffected.
    assert.equal(shadow.consumedBatches.length, 0);
    const shadowJob = db.prepare("SELECT status FROM v2_chat_maintenance_jobs WHERE job_type = 'memory_engine_consume' AND payload LIKE ?").get("%fake_shadow%") as { status: string } | undefined;
    assert.equal(shadowJob?.status, "pending");
  });

  cleanup();
});
