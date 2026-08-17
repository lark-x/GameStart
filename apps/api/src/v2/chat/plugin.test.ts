import assert from "node:assert/strict";
import test from "node:test";

import type { ChatCompletionRequest, ChatCompletionResult, ChatDelta, ChatProvider } from "@living-network/ai/v2";
import type { V2CreateInstantStoryResponse, V2SendChatMessageResponse } from "@living-network/contracts/v2";
import { openV2TempSqliteConnection } from "@living-network/database/v2";
import { mkdtempSync, rmSync } from "node:fs";
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
      const media = (upload.json() as { readonly media: { readonly contentHash: string; readonly mediaRef: string } }).media;
      assert.match(media.contentHash, /^[a-f0-9]{64}$/);
      assert.equal(media.contentHash.startsWith("sha256:"), false);
      const filename = media.mediaRef.replace("media://local/v2/chat/", "");
      const fetched = await runtime.app.inject({ method: "GET", url: `/api/v2/chat/media/${filename}` });
      assert.equal(fetched.statusCode, 200);
      assert.deepEqual(fetched.rawPayload, onePixelPng);
    } finally {
      await runtime.close();
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
    temp.cleanup();
  }
});
