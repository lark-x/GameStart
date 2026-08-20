import assert from "node:assert/strict";
import test from "node:test";

import type { ChatCompletionRequest, ChatCompletionResult, ChatDelta, ChatProvider } from "@living-network/ai/v2";
import type { V2CreateInstantStoryResponse, V2SendChatMessageResponse } from "@living-network/contracts/v2";
import { openV2TempSqliteConnection } from "@living-network/database/v2";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { createV2ApiRuntime } from "../platform/runtime.ts";

class FakeChatProvider implements ChatProvider {
  public async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    return { id: "fake", model: "fake-model", content: String(request.messages.at(-1)?.content ?? "") };
  }

  public async *stream(_request: ChatCompletionRequest): AsyncIterable<ChatDelta> {
    yield { id: "fake", model: "fake-model", content: "你好，" };
    yield { id: "fake", model: "fake-model", content: "我是花火。" };
    yield { finishReason: "stop" };
  }
}

class SlowAbortAwareProvider implements ChatProvider {
  public aborted = false;

  public async complete(_request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    return { id: "slow", model: "slow-model", content: "" };
  }

  public async *stream(request: ChatCompletionRequest): AsyncIterable<ChatDelta> {
    let resolveAbort: () => void = () => undefined;
    const aborted = new Promise<void>((resolve) => { resolveAbort = resolve; });
    const onAbort = (): void => {
      this.aborted = true;
      resolveAbort();
    };
    if (request.signal?.aborted === true) onAbort();
    else request.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      yield { content: "第一段" };
      await aborted;
      throw new Error("aborted by client");
    } finally {
      request.signal?.removeEventListener("abort", onAbort);
    }
  }
}

class CaptureRequestProvider implements ChatProvider {
  public capturedRequest: ChatCompletionRequest | undefined;

  public async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    this.capturedRequest = request;
    return { id: "capture", model: "capture-model", content: "看到图片了" };
  }

  public async *stream(request: ChatCompletionRequest): AsyncIterable<ChatDelta> {
    this.capturedRequest = request;
    yield { id: "capture", model: "capture-model", content: "看到图片了" };
    yield { finishReason: "stop" };
  }
}

test("V2 chat API creates an instant story, sends a message, and streams a persisted reply", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-"));
  temp.db.close();
  try {
    const runtime = createV2ApiRuntime({
      sqlitePath: temp.path,
      mediaRoot,
      chatProvider: new FakeChatProvider(),
    });
    try {
      const created = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: {
          persona: "花火是一个爱笑、嘴硬心软的角色。",
          displayName: "花火",
          idempotencyKey: "instant-test-1",
        },
      });
      assert.equal(created.statusCode, 201);
      const instant = created.json() as V2CreateInstantStoryResponse;
      assert.ok(instant.conversation.conversationId);
      assert.equal(instant.character.name, "花火");

      const instantReplay = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: {
          persona: "花火是一个爱笑、嘴硬心软的角色。",
          displayName: "花火",
          idempotencyKey: "instant-test-1",
        },
      });
      assert.equal(instantReplay.statusCode, 201);
      assert.equal((instantReplay.json() as V2CreateInstantStoryResponse).conversation.conversationId, instant.conversation.conversationId);

      const instantConflict = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: {
          persona: "完全不同的人设",
          displayName: "花火",
          idempotencyKey: "instant-test-1",
        },
      });
      assert.equal(instantConflict.statusCode, 409);

      const sent = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${instant.conversation.conversationId}/messages`,
        payload: {
          text: "你好，花火！",
          idempotencyKey: "message-test-1",
        },
      });
      assert.equal(sent.statusCode, 201);
      const sentMessage = (sent.json() as V2SendChatMessageResponse).message;
      assert.equal(sentMessage.role, "user");

      const replayed = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${instant.conversation.conversationId}/messages`,
        payload: {
          text: "你好，花火！",
          idempotencyKey: "message-test-1",
        },
      });
      assert.equal(replayed.statusCode, 201);
      assert.equal((replayed.json() as V2SendChatMessageResponse).message.messageId, sentMessage.messageId);

      const conflict = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${instant.conversation.conversationId}/messages`,
        payload: {
          text: "不同的内容",
          idempotencyKey: "message-test-1",
        },
      });
      assert.equal(conflict.statusCode, 409);

      const reply = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${instant.conversation.conversationId}/replies`,
        payload: { idempotencyKey: "reply-test-1" },
      });
      assert.equal(reply.statusCode, 200);
      const replyText = reply.payload as string;
      assert.match(replyText, /你好，/);
      assert.match(replyText, /我是花火。/);
      assert.match(replyText, /"type":"message"/);
      assert.match(replyText, /"type":"done"/);

      const history = await runtime.app.inject({
        method: "GET",
        url: `/api/v2/chat/conversations/${instant.conversation.conversationId}/messages`,
      });
      assert.equal(history.statusCode, 200);
      const messages = (history.json() as { readonly messages: readonly { readonly role: string; readonly text?: string }[] }).messages;
      assert.equal(messages.length, 2);
      assert.equal(messages[1]?.role, "assistant");
      assert.equal(messages[1]?.text, "你好，我是花火。");

      const repeated = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${instant.conversation.conversationId}/replies`,
        payload: { idempotencyKey: "reply-test-1" },
      });
      assert.equal(repeated.statusCode, 200);
      const repeatedText = repeated.payload as string;
      assert.match(repeatedText, /"type":"message"/);
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});

test("V2 chat media upload stores a pure sha256 hash and serves identical bytes", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-"));
  temp.db.close();
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2e3VwAAAABJRU5ErkJggg==",
    "base64",
  );
  const boundary = `----v2-chat-${crypto.randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="one.png"\r\nContent-Type: image/png\r\n\r\n`, "utf8"),
    onePixelPng,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
  try {
    const runtime = createV2ApiRuntime({ sqlitePath: temp.path, mediaRoot, chatProvider: new FakeChatProvider() });
    try {
      const upload = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/media",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });
      assert.equal(upload.statusCode, 201);
      const media = (upload.json() as { readonly media: { readonly mediaId: string; readonly contentHash: string; readonly mediaRef: string } }).media;
      assert.match(media.contentHash, /^[a-f0-9]{64}$/);
      assert.equal(media.contentHash.startsWith("sha256:"), false);
      const filename = media.mediaRef.replace("media://local/v2/chat/", "");
      const fetched = await runtime.app.inject({ method: "GET", url: `/api/v2/chat/media/${filename}` });
      assert.equal(fetched.statusCode, 200);
      assert.deepEqual(fetched.rawPayload, onePixelPng);

      const duplicate = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/media",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });
      assert.equal(duplicate.statusCode, 201);
      const duplicateMedia = (duplicate.json() as { readonly media: { readonly mediaId: string } }).media;
      assert.equal(duplicateMedia.mediaId, media.mediaId);
      const mediaRows = runtime.db.prepare("SELECT COUNT(*) AS count FROM v2_chat_media").get() as { readonly count: number };
      assert.equal(mediaRows.count, 1);
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});

test("V2 chat stop generation aborts provider and persists an interrupted message", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-"));
  temp.db.close();
  const provider = new SlowAbortAwareProvider();
  try {
    const runtime = createV2ApiRuntime({ sqlitePath: temp.path, mediaRoot, chatProvider: provider });
    try {
      const created = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: { persona: "花火是慢速测试角色", displayName: "花火", idempotencyKey: "instant-stop-test" },
      });
      assert.equal(created.statusCode, 201);
      const instant = created.json() as V2CreateInstantStoryResponse;
      const conversationId = instant.conversation.conversationId;

      const sent = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${conversationId}/messages`,
        payload: { text: "请开始", idempotencyKey: "stop-message" },
      });
      assert.equal(sent.statusCode, 201);

      await runtime.app.listen({ port: 0, host: "127.0.0.1" });
      const address = runtime.app.server.address();
      assert.ok(address !== null && typeof address === "object");
      const url = `http://127.0.0.1:${address.port}/api/v2/chat/conversations/${conversationId}/replies`;
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
        }, (res) => {
          res.once("data", () => {
            req.destroy();
            resolve();
          });
          res.on("error", reject);
        });
        req.on("error", reject);
        req.end(JSON.stringify({ idempotencyKey: "stop-reply" }));
      });
      const deadline = Date.now() + 2000;
      while (!provider.aborted && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(provider.aborted, true);

      const history = await runtime.app.inject({
        method: "GET",
        url: `/api/v2/chat/conversations/${conversationId}/messages?limit=50`,
      });
      assert.equal(history.statusCode, 200);
      const messages = (history.json() as { readonly messages: readonly { readonly role: string; readonly text?: string; readonly status: string }[] }).messages;
      const assistant = messages.filter((message) => message.role === "assistant");
      assert.equal(assistant.length, 1);
      assert.equal(assistant[0]?.status, "interrupted");
      assert.equal(assistant[0]?.text, "第一段");

      // Verify pagination retains latest message when limit is smaller than total messages
      const page1 = await runtime.app.inject({
        method: "GET",
        url: `/api/v2/chat/conversations/${conversationId}/messages?limit=1`,
      });
      assert.equal(page1.statusCode, 200);
      const page1Data = page1.json() as { readonly messages: readonly { readonly role: string; readonly text?: string }[]; readonly nextBeforeMessageId?: string; readonly hasMore: boolean };
      assert.equal(page1Data.messages.length, 1);
      assert.equal(page1Data.messages[0]?.role, "assistant");
      assert.equal(page1Data.hasMore, true);
      assert.ok(page1Data.nextBeforeMessageId);

      const page2 = await runtime.app.inject({
        method: "GET",
        url: `/api/v2/chat/conversations/${conversationId}/messages?limit=1&before=${page1Data.nextBeforeMessageId}`,
      });
      assert.equal(page2.statusCode, 200);
      const page2Data = page2.json() as { readonly messages: readonly { readonly role: string; readonly text?: string }[]; readonly nextBeforeMessageId?: string; readonly hasMore: boolean };
      assert.equal(page2Data.messages.length, 1);
      assert.equal(page2Data.messages[0]?.role, "user");
      assert.equal(page2Data.messages[0]?.text, "请开始");
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});

test("V2 chat rejects image attachments when model does not support vision modality", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-vision-"));
  temp.db.close();
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2e3VwAAAABJRU5ErkJggg==",
    "base64",
  );
  const boundary = `----v2-chat-${crypto.randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`, "utf8"),
    onePixelPng,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
  try {
    const runtime = createV2ApiRuntime({ sqlitePath: temp.path, mediaRoot, chatProvider: new FakeChatProvider() });
    try {
      const upload = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/media",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });
      assert.equal(upload.statusCode, 201);
      const media = (upload.json() as { readonly media: { readonly mediaId: string } }).media;

      const created = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: { persona: "纯文本角色", displayName: "花火", idempotencyKey: "vision-reject-test" },
      });
      assert.equal(created.statusCode, 201);
      const instant = created.json() as V2CreateInstantStoryResponse;
      const conversationId = instant.conversation.conversationId;

      const sendRes = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${conversationId}/messages`,
        payload: {
          text: "看看这张图",
          attachmentIds: [media.mediaId],
          idempotencyKey: "send-with-image",
        },
      });
      assert.equal(sendRes.statusCode, 201);

      const replyRes = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${conversationId}/replies`,
        payload: { idempotencyKey: "reply-with-image" },
      });
      assert.equal(replyRes.statusCode, 400);
      assert.equal(replyRes.json().error.code, "VISION_NOT_SUPPORTED");

      // Verify 404 MEDIA_NOT_FOUND code for non-existent media with valid hash filename
      const missingMediaRes = await runtime.app.inject({
        method: "GET",
        url: `/api/v2/chat/media/${"a".repeat(64)}.png`,
      });
      assert.equal(missingMediaRes.statusCode, 404);
      assert.equal(missingMediaRes.json().error.code, "MEDIA_NOT_FOUND");

      // Verify 422 INVALID_MEDIA_REF code for invalid filename format
      const invalidMediaRes = await runtime.app.inject({
        method: "GET",
        url: "/api/v2/chat/media/non-existent-media.png",
      });
      assert.equal(invalidMediaRes.statusCode, 422);
      assert.equal(invalidMediaRes.json().error.code, "INVALID_MEDIA_REF");
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});

test("V2 chat vision sends real image content to the provider", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-vision-positive-"));
  temp.db.close();
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2e3VwAAAABJRU5ErkJggg==",
    "base64",
  );
  const boundary = `----v2-chat-${crypto.randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="vision.png"\r\nContent-Type: image/png\r\n\r\n`, "utf8"),
    onePixelPng,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
  const provider = new CaptureRequestProvider();
  try {
    const runtime = createV2ApiRuntime({
      sqlitePath: temp.path,
      mediaRoot,
      chatProvider: provider,
      chatInputModalities: ["text", "image"],
    });
    try {
      const upload = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/media",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });
      assert.equal(upload.statusCode, 201);
      const media = (upload.json() as { readonly media: { readonly mediaId: string; readonly mediaRef: string } }).media;

      const created = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: { persona: "能看图的花火", displayName: "花火", idempotencyKey: "vision-positive-test" },
      });
      assert.equal(created.statusCode, 201);
      const instant = created.json() as V2CreateInstantStoryResponse;
      const conversationId = instant.conversation.conversationId;

      const sent = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${conversationId}/messages`,
        payload: {
          text: "看看这张图里有什么",
          attachmentIds: [media.mediaId],
          idempotencyKey: "send-vision-image",
        },
      });
      assert.equal(sent.statusCode, 201);

      const reply = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${conversationId}/replies`,
        payload: { idempotencyKey: "reply-vision-image" },
      });
      assert.equal(reply.statusCode, 200);
      assert.match(reply.payload as string, /看到图片了/);

      const request = provider.capturedRequest;
      assert.ok(request);
      const lastUser = [...request.messages].reverse().find((message) => message.role === "user");
      assert.ok(lastUser);
      assert.ok(Array.isArray(lastUser.content));
      const imagePart = (lastUser.content as readonly { readonly type: string; readonly mediaType?: string; readonly dataBase64?: string }[])
        .find((part) => part.type === "image");
      assert.ok(imagePart);
      assert.equal(imagePart.mediaType, "image/png");
      assert.deepEqual(Buffer.from(imagePart.dataBase64!, "base64"), onePixelPng);

      const textPart = (lastUser.content as readonly { readonly type: string; readonly text?: string }[])
        .find((part) => part.type === "text");
      assert.ok(textPart);
      assert.match(textPart.text ?? "", /看看这张图里有什么/);
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});

test("V2 chat diagnostics exposes the last real prompt trace", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-trace-"));
  temp.db.close();
  try {
    const runtime = createV2ApiRuntime({ sqlitePath: temp.path, mediaRoot, chatProvider: new FakeChatProvider() });
    try {
      const created = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: { persona: "花火是爱笑角色", displayName: "花火", idempotencyKey: "trace-test" },
      });
      assert.equal(created.statusCode, 201);
      const instant = created.json() as V2CreateInstantStoryResponse;
      const conversationId = instant.conversation.conversationId;

      await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${conversationId}/messages`,
        payload: { text: "你好", idempotencyKey: "trace-msg" },
      });
      const reply = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${conversationId}/replies`,
        payload: { idempotencyKey: "trace-reply" },
      });
      assert.equal(reply.statusCode, 200);

      const diagnostics = await runtime.app.inject({
        method: "GET",
        url: `/api/v2/chat/conversations/${conversationId}/diagnostics/latest`,
      });
      assert.equal(diagnostics.statusCode, 200);
      const trace = (diagnostics.json() as { readonly trace?: { readonly status: string; readonly templateId: string; readonly estimatedTokens: number; readonly totalLatencyMs?: number; readonly firstTokenLatencyMs?: number; readonly model?: string } }).trace;
      assert.ok(trace, "Diagnostics must include a real trace");
      assert.equal(trace.status, "completed");
      assert.equal(trace.templateId, "chat-reply-v1");
      assert.ok(trace.estimatedTokens > 0);
      assert.ok(trace.totalLatencyMs !== undefined);
      assert.ok(trace.firstTokenLatencyMs !== undefined);
      assert.equal(trace.model, "test-model");
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});

test("V2 chat contacts, character conversations, context, and features endpoints", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-"));
  temp.db.close();
  try {
    const runtime = createV2ApiRuntime({ sqlitePath: temp.path, mediaRoot, chatProvider: new FakeChatProvider() });
    try {
      const world = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/core/worlds",
        payload: { storyWorldId: "world:test", name: "星穹铁道", idempotencyKey: "world:test" },
      });
      assert.equal(world.statusCode, 201);
      const character = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/core/worlds/world:test/characters",
        payload: { characterId: "character:hua", name: "花火", summary: "嘴硬心软", expectedRevision: 1, idempotencyKey: "character:hua" },
      });
      assert.equal(character.statusCode, 201);

      const contacts = await runtime.app.inject({ method: "GET", url: "/api/v2/chat/contacts" });
      assert.equal(contacts.statusCode, 200);
      const contactList = contacts.json().contacts;
      assert.equal(contactList.length, 1);
      assert.equal(contactList[0].characterName, "花火");
      assert.equal(contactList[0].storyWorldName, "星穹铁道");
      assert.equal(contactList[0].activeMemoryCount, 0);

      const createdConv = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/conversations",
        payload: { storyWorldId: "world:test", characterId: "character:hua", idempotencyKey: "conv:1" },
      });
      assert.equal(createdConv.statusCode, 201);
      const convId = createdConv.json().conversation.conversationId as string;
      assert.ok(convId);

      const context = await runtime.app.inject({ method: "GET", url: `/api/v2/chat/conversations/${convId}/context` });
      assert.equal(context.statusCode, 200);
      assert.equal(context.json().character.name, "花火");
      assert.equal(context.json().world.name, "星穹铁道");
      assert.equal(context.json().memory.activeCount, 0);

      const features = await runtime.app.inject({ method: "GET", url: `/api/v2/chat/conversations/${convId}/features` });
      assert.equal(features.statusCode, 200);
      assert.equal(features.json().modelConfigured, true);
      assert.equal(features.json().text, true);
      assert.equal(features.json().imageUpload, false);

      const replay = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/conversations",
        payload: { storyWorldId: "world:test", characterId: "character:hua", idempotencyKey: "conv:2" },
      });
      assert.equal(replay.statusCode, 201);
      assert.equal(replay.json().conversation.conversationId, convId);

      const missing = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/conversations",
        payload: { storyWorldId: "world:test", characterId: "character:missing", idempotencyKey: "conv:3" },
      });
      assert.equal(missing.statusCode, 404);

      await runtime.app.inject({
        method: "POST",
        url: "/api/v2/core/worlds",
        payload: { storyWorldId: "world:other", name: "枫丹", idempotencyKey: "world:other" },
      });
      await runtime.app.inject({
        method: "POST",
        url: "/api/v2/core/worlds/world:other/characters",
        payload: { characterId: "character:fnn", name: "芙宁娜", expectedRevision: 1, idempotencyKey: "character:fnn" },
      });
      const crossWorld = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/conversations",
        payload: { storyWorldId: "world:test", characterId: "character:fnn", idempotencyKey: "conv:4" },
      });
      assert.equal(crossWorld.statusCode, 404);
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});

test("V2 chat features reflect multimodal modality and missing chat binding", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-"));
  temp.db.close();
  try {
    const multimodal = createV2ApiRuntime({
      sqlitePath: temp.path,
      mediaRoot,
      chatProvider: new FakeChatProvider(),
      chatInputModalities: ["text", "image"],
    });
    try {
      const created = await multimodal.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: { persona: "p", displayName: "M", idempotencyKey: "feat-multi" },
      });
      const convId = (created.json() as V2CreateInstantStoryResponse).conversation.conversationId;
      const features = await multimodal.app.inject({ method: "GET", url: `/api/v2/chat/conversations/${convId}/features` });
      assert.equal(features.statusCode, 200);
      assert.equal(features.json().imageUpload, true);
      assert.equal(features.json().stickers, true);
      assert.equal(features.json().imageUnderstanding, true);
    } finally {
      await multimodal.close();
    }

    const noModel = createV2ApiRuntime({ sqlitePath: temp.path, mediaRoot });
    try {
      const created = await noModel.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: { persona: "p", displayName: "M", idempotencyKey: "feat-none" },
      });
      const convId = (created.json() as V2CreateInstantStoryResponse).conversation.conversationId;
      const features = await noModel.app.inject({ method: "GET", url: `/api/v2/chat/conversations/${convId}/features` });
      assert.equal(features.statusCode, 200);
      assert.equal(features.json().modelConfigured, false);
      assert.equal(features.json().text, false);
      assert.equal(features.json().imageUpload, false);
    } finally {
      await noModel.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});

test("V2 chat prompt carries Canon persona text into the provider request", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-"));
  temp.db.close();
  try {
    const provider = new CaptureRequestProvider();
    const runtime = createV2ApiRuntime({ sqlitePath: temp.path, mediaRoot, chatProvider: provider });
    try {
      const created = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: { persona: "花火最爱吃桂花糕，嘴硬心软。", displayName: "花火", idempotencyKey: "persona-prompt" },
      });
      const convId = (created.json() as V2CreateInstantStoryResponse).conversation.conversationId;
      await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${convId}/messages`,
        payload: { text: "你好", idempotencyKey: "persona-msg" },
      });
      await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${convId}/replies`,
        payload: { idempotencyKey: "persona-reply" },
      });
      const serialized = JSON.stringify(provider.capturedRequest?.messages ?? []);
      assert.match(serialized, /花火最爱吃桂花糕/);
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});

test("V2 chat stickers create from media and reorder on use", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-"));
  temp.db.close();
  try {
    const runtime = createV2ApiRuntime({ sqlitePath: temp.path, mediaRoot, chatProvider: new FakeChatProvider() });
    try {
      const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
      const boundary = "sticker-boundary";
      const multipart = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sticker.png"\r\nContent-Type: image/png\r\n\r\n`, "utf8"),
        onePixelPng,
        Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
      ]);
      const uploaded = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/media",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: multipart,
      });
      assert.equal(uploaded.statusCode, 201);
      const mediaId = uploaded.json().media.mediaId as string;

      const created = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/stickers",
        payload: { mediaId, label: "开心" },
      });
      assert.equal(created.statusCode, 201);
      assert.equal(created.json().sticker.label, "开心");
      const stickerId = created.json().sticker.stickerId as string;

      const list = await runtime.app.inject({ method: "GET", url: "/api/v2/chat/stickers" });
      assert.equal(list.statusCode, 200);
      assert.equal(list.json().stickers.length, 1);

      const used = await runtime.app.inject({ method: "POST", url: `/api/v2/chat/stickers/${stickerId}/use` });
      assert.equal(used.statusCode, 200);

      const missing = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/stickers",
        payload: { mediaId: "media:missing", label: "x" },
      });
      assert.equal(missing.statusCode, 404);
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});
