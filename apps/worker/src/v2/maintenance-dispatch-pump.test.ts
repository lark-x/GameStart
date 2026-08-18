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
