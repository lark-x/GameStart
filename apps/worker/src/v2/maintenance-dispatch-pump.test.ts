import assert from "node:assert/strict";
import test from "node:test";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  v2ChatMigrations,
  V2SqliteChatUnitOfWork,
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
import type { ChatProvider } from "@living-network/ai/v2";

const now = "2026-08-12T03:00:00.000Z" as V2IsoDateTime;

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

  const providerReply = JSON.stringify({
    memories: [
      {
        kind: "preference",
        content: "User loves hiking in high mountains.",
        importance: 0.8,
        confidence: 0.9,
        sourceMessageIds: [msg1Id],
      },
      {
        kind: "preference",
        content: "Hallucinated citation.",
        importance: 0.5,
        confidence: 0.5,
        sourceMessageIds: ["msg_fake_999"], // Not in sourceMessageIds, should be dropped!
      },
    ],
  });

  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_1",
    unitOfWork: uow,
    provider: createTestProvider(providerReply),
  });

  const processed = await pump.tick();
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

  const provider = createTestProvider(JSON.stringify([
    {
      kind: "preference",
      content: "用户现在不喝咖啡了，更喜欢喝茶",
      importance: 4,
      confidence: 0.95,
      sourceMessageIds: [teaMsgId],
    },
  ]));
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
      return { id: "extract", model: "test-model", content: JSON.stringify([{
        kind: "preference",
        content: "用户现在不喝咖啡了，更喜欢喝茶",
        importance: 4,
        confidence: 0.95,
        sourceMessageIds: [teaMsgId],
      }]) };
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
