import assert from "node:assert/strict";
import test from "node:test";

import type { V2ChatMessagePageResponse, V2ConversationId, V2MessageId } from "@living-network/contracts/v2";
import { createV2ChatClient, V2ChatClientError } from "./client.ts";

test("V2ChatClient listMessages builds beforeMessageId and limit query parameters", async () => {
  const calls: { url: string; method?: string }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    const payload: V2ChatMessagePageResponse = {
      messages: [
        {
          messageId: "msg_1" as V2MessageId,
          conversationId: "conv_1" as V2ConversationId,
          role: "user",
          text: "hello",
          attachments: [],
          status: "completed",
          createdAt: "2026-08-17T00:00:00.000Z" as any,
          idempotencyKey: "idem_1" as any,
        },
      ],
      hasMore: true,
      nextBeforeMessageId: "msg_1" as V2MessageId,
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3002", fetchImpl: fakeFetch });

  // First page without beforeMessageId
  const page1 = await client.listMessages("conv_1" as V2ConversationId, { limit: 50 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://127.0.0.1:3002/api/v2/chat/conversations/conv_1/messages?limit=50");
  assert.equal(page1.messages.length, 1);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.nextBeforeMessageId, "msg_1");

  // Second page with beforeMessageId
  const page2 = await client.listMessages("conv_1" as V2ConversationId, {
    beforeMessageId: "msg_50" as V2MessageId,
    limit: 50,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.url, "http://127.0.0.1:3002/api/v2/chat/conversations/conv_1/messages?limit=50&beforeMessageId=msg_50");
  assert.equal(page2.messages.length, 1);
});

test("V2ChatClient getLatestDiagnostics fetches diagnostics from api", async () => {
  const fakeFetch: typeof fetch = async (input) => {
    assert.equal(String(input), "http://127.0.0.1:3002/api/v2/chat/conversations/conv_diag/diagnostics/latest");
    return new Response(
      JSON.stringify({
        templateId: "chat:roleplay:v1",
        inputBudget: 4096,
        selectedMemoryIds: ["mem_1", "mem_2"],
        summaryVersion: 2,
        recentCount: 15,
        imageCount: 1,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3002", fetchImpl: fakeFetch });
  const diag = await client.getLatestDiagnostics("conv_diag" as V2ConversationId);

  assert.equal(diag.templateId, "chat:roleplay:v1");
  assert.equal(diag.inputBudget, 4096);
  assert.equal(diag.selectedMemoryIds?.length, 2);
  assert.equal(diag.summaryVersion, 2);
  assert.equal(diag.recentCount, 15);
  assert.equal(diag.imageCount, 1);
});

test("V2ChatClient maps error responses into V2ChatClientError", async () => {
  const fakeFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ error: { code: "NOT_FOUND", message: "Conversation not found" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  };

  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3002", fetchImpl: fakeFetch });
  await assert.rejects(
    async () => client.listMessages("conv_missing" as V2ConversationId),
    (err: Error) => {
      assert.ok(err instanceof V2ChatClientError);
      assert.equal((err as V2ChatClientError).code, "NOT_FOUND");
      assert.equal((err as V2ChatClientError).status, 404);
      assert.equal(err.message, "Conversation not found");
      return true;
    },
  );
});

test("V2ChatClient triggerStoryAnalyze calls analyze endpoint with idempotencyKey", async () => {
  const calls: { url: string; method?: string; body?: string }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method, body: init?.body ? String(init.body) : undefined });
    return new Response(
      JSON.stringify({
        jobId: "job:maint:analyze_123",
        conversationId: "conv_analyze_1",
      }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    );
  };

  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3002", fetchImpl: fakeFetch });
  const result = await client.triggerStoryAnalyze("conv_analyze_1" as V2ConversationId, {
    idempotencyKey: "test_key_123",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://127.0.0.1:3002/api/v2/chat/conversations/conv_analyze_1/analyze");
  assert.equal(calls[0]?.method, "POST");
  assert.ok(calls[0]?.body?.includes('"idempotencyKey":"test_key_123"'));
  assert.equal(result.jobId, "job:maint:analyze_123");
  assert.equal(result.conversationId, "conv_analyze_1");
});

test("V2ChatClient mediaUrl formats valid local chat media url", () => {
  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3002" });
  const hash = "a".repeat(64);
  const formatted = client.mediaUrl(`media://local/v2/chat/${hash}.png`);
  assert.equal(formatted, `http://127.0.0.1:3002/api/v2/chat/media/${hash}.png`);
});
