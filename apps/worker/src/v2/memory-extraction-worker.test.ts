import assert from "node:assert/strict";
import test from "node:test";

import type { ChatCompletionRequest, ChatCompletionResult, ChatDelta, ChatProvider } from "@living-network/ai/v2";
import { createV2CanonWorld, createV2ChatConversation, createV2ChatMaintenanceJob, createV2ChatMessage } from "@living-network/domain/v2";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  V2SqliteChatMaintenanceJobRepository,
  V2SqliteChatUnitOfWork,
} from "@living-network/database/v2";

import { processPendingMemoryExtractionJobs } from "./memory-extraction-worker.ts";

class MemoryProvider implements ChatProvider {
  public async complete(_request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    return {
      id: "memory",
      model: "memory-model",
      content: JSON.stringify({
        memories: [
          { kind: "preference", content: "用户不喜欢香菜", importance: 0.7, confidence: 0.95, sourceMessageIds: ["message:1"] },
        ],
      }),
    };
  }

  public async *stream(_request: ChatCompletionRequest): AsyncIterable<ChatDelta> {
    yield { content: "" };
  }
}

test("memory extraction worker persists validated memories and completes the job", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);
    const jobs = new V2SqliteChatMaintenanceJobRepository(temp.db);
    await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:memory-worker",
      name: "Memory Worker World",
    })));
    await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:memory-worker",
      storyWorldId: "world:memory-worker",
      primaryCharacterId: "character:one",
    })));
    await unit.withChatTransaction(async ({ messages }) => messages.create(createV2ChatMessage({
      messageId: "message:1",
      conversationId: "conversation:memory-worker",
      role: "user",
      text: "我的生日是 3 月 12 日。",
      idempotencyKey: "memory-worker-message",
    })));
    await jobs.create(createV2ChatMaintenanceJob({
      jobId: "job:memory:worker",
      conversationId: "conversation:memory-worker",
      jobType: "memory_extract",
      payload: {},
      dedupeKey: "memory_extract:conversation:memory-worker:message:1",
    }));

    await processPendingMemoryExtractionJobs({
      jobs,
      unitOfWork: unit,
      provider: new MemoryProvider(),
    });

    const memories = await unit.withChatTransaction(async ({ memories }) => memories.listActiveByStoryWorld("world:memory-worker" as never));
    assert.equal(memories.length, 1);
    assert.equal(memories[0]?.content, "用户不喜欢香菜");
    const job = await jobs.findByDedupeKey({
      conversationId: "conversation:memory-worker" as never,
      jobType: "memory_extract",
      dedupeKey: "memory_extract:conversation:memory-worker:message:1",
    });
    assert.equal(job?.status, "succeeded");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});
