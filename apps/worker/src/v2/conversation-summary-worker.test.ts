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

import { processPendingConversationSummaryJobs } from "./conversation-summary-worker.ts";

class SummaryProvider implements ChatProvider {
  public async complete(_request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    return { id: "summary", model: "summary-model", content: "新摘要：两人在桥上相遇后决定去旧书店。" };
  }

  public async *stream(_request: ChatCompletionRequest): AsyncIterable<ChatDelta> {
    yield { content: "" };
  }
}

test("conversation summary worker persists incremental summary and completes the job", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);
    const jobs = new V2SqliteChatMaintenanceJobRepository(temp.db);
    await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:summary-worker",
      name: "Summary Worker World",
    })));
    await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:summary-worker",
      storyWorldId: "world:summary-worker",
      primaryCharacterId: "character:one",
    })));
    await unit.withChatTransaction(async ({ messages }) => messages.create(createV2ChatMessage({
      messageId: "message:summary:1",
      conversationId: "conversation:summary-worker",
      role: "user",
      text: "我们在桥上相遇。",
      idempotencyKey: "summary-message-1",
    })));
    await jobs.create(createV2ChatMaintenanceJob({
      jobId: "job:summary:worker",
      conversationId: "conversation:summary-worker",
      jobType: "conversation_summary",
      payload: {},
      dedupeKey: "conversation_summary:conversation:summary-worker:message:summary:1",
    }));

    await processPendingConversationSummaryJobs({
      jobs,
      unitOfWork: unit,
      provider: new SummaryProvider(),
    });

    const summary = await unit.withChatTransaction(async ({ summaries }) => summaries.get("conversation:summary-worker" as never));
    assert.ok(summary !== undefined);
    assert.equal(summary.version, 1);
    assert.equal(summary.coveredUntilMessageId, "message:summary:1");
    assert.ok(summary.summary.includes("旧书店"));
    const job = await jobs.findByDedupeKey({
      conversationId: "conversation:summary-worker" as never,
      jobType: "conversation_summary",
      dedupeKey: "conversation_summary:conversation:summary-worker:message:summary:1",
    });
    assert.equal(job?.status, "succeeded");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});
