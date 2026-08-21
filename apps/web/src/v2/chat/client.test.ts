import assert from "node:assert/strict";
import test from "node:test";

import type {
  V2ChatMessagePageResponse,
  V2ConversationId,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2MessageId,
} from "@living-network/contracts/v2";
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
          createdAt: "2026-08-17T00:00:00.000Z" as V2IsoDateTime,
          idempotencyKey: "idem_1" as V2IdempotencyKey,
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

  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3003", fetchImpl: fakeFetch });

  // First page without beforeMessageId
  const page1 = await client.listMessages("conv_1" as V2ConversationId, { limit: 50 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://127.0.0.1:3003/api/v2/chat/conversations/conv_1/messages?limit=50");
  assert.equal(page1.messages.length, 1);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.nextBeforeMessageId, "msg_1");

  // Second page with beforeMessageId
  const page2 = await client.listMessages("conv_1" as V2ConversationId, {
    beforeMessageId: "msg_50" as V2MessageId,
    limit: 50,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.url, "http://127.0.0.1:3003/api/v2/chat/conversations/conv_1/messages?limit=50&beforeMessageId=msg_50");
  assert.equal(page2.messages.length, 1);
});

test("V2ChatClient getLatestDiagnostics fetches diagnostics from api", async () => {
  const fakeFetch: typeof fetch = async (input) => {
    assert.equal(String(input), "http://127.0.0.1:3003/api/v2/chat/conversations/conv_diag/diagnostics/latest");
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

  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3003", fetchImpl: fakeFetch });
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

  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3003", fetchImpl: fakeFetch });
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

  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3003", fetchImpl: fakeFetch });
  const result = await client.triggerStoryAnalyze("conv_analyze_1" as V2ConversationId, {
    idempotencyKey: "test_key_123",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://127.0.0.1:3003/api/v2/chat/conversations/conv_analyze_1/analyze");
  assert.equal(calls[0]?.method, "POST");
  assert.ok(calls[0]?.body?.includes('"idempotencyKey":"test_key_123"'));
  assert.equal(result.jobId, "job:maint:analyze_123");
  assert.equal(result.conversationId, "conv_analyze_1");
});

test("V2ChatClient mediaUrl formats valid local chat media url", () => {
  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3003" });
  const hash = "a".repeat(64);
  const formatted = client.mediaUrl(`media://local/v2/chat/${hash}.png`);
  assert.equal(formatted, `http://127.0.0.1:3003/api/v2/chat/media/${hash}.png`);
});

test("V2ChatClient maps contacts, conversation creation, context, and features", async () => {
  const calls: { url: string; method?: string; body?: string }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.endsWith("/chat/contacts")) {
      return Response.json({ contacts: [{ characterId: "character:hua", storyWorldId: "world:test", characterName: "花火", storyWorldName: "星穹铁道", activeMemoryCount: 0 }] });
    }
    if (url.endsWith("/chat/conversations") && method === "GET") {
      return Response.json({ conversations: [{ conversationId: "conv_1", storyWorldId: "world:test", primaryCharacterId: "character:hua", characterName: "花火", storyWorldName: "星穹铁道" }] });
    }
    if (url.endsWith("/chat/conversations") && method === "POST") {
      return Response.json({ conversation: { conversationId: "conv_1", storyWorldId: "world:test", primaryCharacterId: "character:hua", characterName: "花火", storyWorldName: "星穹铁道" } }, { status: 201 });
    }
    if (url.endsWith("/context")) {
      return Response.json({ conversation: { conversationId: "conv_1", storyWorldId: "world:test", primaryCharacterId: "character:hua", characterName: "花火", storyWorldName: "星穹铁道" }, character: { characterId: "character:hua", name: "花火" }, world: { storyWorldId: "world:test", name: "星穹铁道" }, memory: { activeCount: 0, recent: [] } });
    }
    if (url.endsWith("/features")) {
      return Response.json({ modelConfigured: true, text: true, emoji: true, imageUpload: true, imageUnderstanding: true, stickers: true, streaming: true, storyAnalyze: true });
    }
    throw new Error("unhandled " + method + " " + url);
  };
  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3003", fetchImpl: fakeFetch });

  const contacts = await client.listContacts();
  assert.equal(contacts[0]?.characterName, "花火");
  const summaries = await client.listConversationSummaries();
  assert.equal(summaries[0]?.characterName, "花火");
  const created = await client.createConversation({ storyWorldId: "world:test" as never, characterId: "character:hua" as never, idempotencyKey: "k" as never });
  assert.equal(created.conversation.conversationId, "conv_1");
  const context = await client.getConversationContext("conv_1" as V2ConversationId);
  assert.equal(context.character.name, "花火");
  const features = await client.getConversationFeatures("conv_1" as V2ConversationId);
  assert.equal(features.imageUpload, true);
  assert.ok(calls.some((call) => call.method === "POST" && call.body?.includes("character:hua")));
});

test("V2ChatClient maps sticker endpoints", async () => {
  const calls: { url: string; method?: string }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.endsWith("/chat/stickers") && method === "GET") {
      return Response.json({ stickers: [{ stickerId: "sticker:1", mediaId: "media:1", mediaRef: "media://local/v2/chat/a.png", label: "开心", createdAt: "now" }] });
    }
    if (url.endsWith("/chat/stickers") && method === "POST") {
      return Response.json({ sticker: { stickerId: "sticker:1", mediaId: "media:1", mediaRef: "media://local/v2/chat/a.png", label: "开心", createdAt: "now" } }, { status: 201 });
    }
    if (url.includes("/chat/stickers/sticker%3A1/use") && method === "POST") {
      return Response.json({ ok: true });
    }
    throw new Error("unhandled " + method + " " + url);
  };
  const client = createV2ChatClient({ baseUrl: "http://127.0.0.1:3003", fetchImpl: fakeFetch });

  const stickers = await client.listStickers();
  assert.equal(stickers[0]?.label, "开心");
  const created = await client.createSticker({ mediaId: "media:1" as never, label: "开心" });
  assert.equal(created.stickerId, "sticker:1");
  await client.touchStickerLastUsed("sticker:1");
  assert.ok(calls.some((call) => call.method === "POST" && call.url.includes("/use")));
});
