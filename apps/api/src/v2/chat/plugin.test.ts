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

class CapturingProvider implements ChatProvider {
  public captured: ChatCompletionRequest["messages"][] = [];

  public async complete(_request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    return { id: "capture", model: "capture-model", content: "ok" };
  }

  public async *stream(request: ChatCompletionRequest): AsyncIterable<ChatDelta> {
    this.captured.push(request.messages);
    yield { content: "我看到了图片。" };
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
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});

test("V2 chat sends real image content to the provider", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-"));
  temp.db.close();
  const provider = new CapturingProvider();
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2e3VwAAAABJRU5ErkJggg==",
    "base64",
  );
  const boundary = `----v2-vision-${crypto.randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="vision.png"\r\nContent-Type: image/png\r\n\r\n`, "utf8"),
    onePixelPng,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
  try {
    const runtime = createV2ApiRuntime({ sqlitePath: temp.path, mediaRoot, chatProvider: provider });
    try {
      const created = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: { persona: "花火能看到图片", displayName: "花火", idempotencyKey: "instant-vision-test" },
      });
      assert.equal(created.statusCode, 201);
      const instant = created.json() as V2CreateInstantStoryResponse;
      const conversationId = instant.conversation.conversationId;

      const upload = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/chat/media",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });
      assert.equal(upload.statusCode, 201);
      const media = (upload.json() as { readonly media: { readonly mediaId: string } }).media;

      const sent = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${conversationId}/messages`,
        payload: { text: "这是什么？", attachmentIds: [media.mediaId], idempotencyKey: "vision-message" },
      });
      assert.equal(sent.statusCode, 201);

      const reply = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${conversationId}/replies`,
        payload: { idempotencyKey: "vision-reply" },
      });
      assert.equal(reply.statusCode, 200);
      assert.match(reply.payload as string, /我看到了图片/);

      assert.equal(provider.captured.length, 1);
      const captured = provider.captured[0]!;
      const userMessage = [...captured].reverse().find((message) => message.role === "user");
      assert.ok(userMessage !== undefined);
      const content = userMessage.content;
      assert.ok(Array.isArray(content));
      const imagePart = (content as readonly { readonly type?: string; readonly dataBase64?: string }[]).find((part) => part.type === "image");
      assert.ok(imagePart !== undefined);
      assert.ok((imagePart.dataBase64 ?? "").length > 0);
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});

test("V2 chat creates durable maintenance jobs after user turns", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-media-"));
  temp.db.close();
  try {
    const runtime = createV2ApiRuntime({ sqlitePath: temp.path, mediaRoot, chatProvider: new FakeChatProvider() });
    try {
      const created = await runtime.app.inject({
        method: "POST",
        url: "/api/v2/instant-stories",
        payload: { persona: "花火", displayName: "花火", idempotencyKey: "instant-jobs-test" },
      });
      assert.equal(created.statusCode, 201);
      const instant = created.json() as V2CreateInstantStoryResponse;
      const conversationId = instant.conversation.conversationId;

      for (let index = 1; index <= 4; index += 1) {
        const sent = await runtime.app.inject({
          method: "POST",
          url: `/api/v2/chat/conversations/${conversationId}/messages`,
          payload: { text: `第 ${index} 条`, idempotencyKey: `jobs-message-${index}` },
        });
        assert.equal(sent.statusCode, 201);
        const reply = await runtime.app.inject({
          method: "POST",
          url: `/api/v2/chat/conversations/${conversationId}/replies`,
          payload: { idempotencyKey: `jobs-reply-${index}` },
        });
        assert.equal(reply.statusCode, 200);
      }

      const jobCount = runtime.db.prepare("SELECT COUNT(*) AS count FROM v2_chat_maintenance_jobs WHERE job_type = 'memory_extract'").get() as { readonly count: number };
      assert.equal(jobCount.count, 1);
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});
