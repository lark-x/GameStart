import assert from "node:assert/strict";
import test from "node:test";

import {
  assertV2PersonaText,
  createV2ChatConversation,
  createV2ChatMedia,
  createV2ChatMessage,
  createV2Memory,
} from "./index.ts";

test("chat domain validates persona and creates a direct conversation", () => {
  assert.equal(assertV2PersonaText("  花火是一个爱笑的人  "), "花火是一个爱笑的人");
  assert.throws(() => assertV2PersonaText("   "));

  const conversation = createV2ChatConversation({
    conversationId: "conversation:one",
    storyWorldId: "world:one",
    primaryCharacterId: "character:one",
    title: "花火",
  });
  assert.equal(conversation.type, "direct");
  assert.equal(conversation.title, "花火");
});

test("chat domain creates messages with text or attachments", () => {
  const text = createV2ChatMessage({
    messageId: "message:one",
    conversationId: "conversation:one",
    role: "user",
    text: "你好",
    idempotencyKey: "key:one",
  });
  assert.equal(text.text, "你好");
  assert.equal(text.status, "completed");

  const image = createV2ChatMessage({
    messageId: "message:two",
    conversationId: "conversation:one",
    role: "user",
    attachments: [{
      attachmentId: "att:one",
      kind: "image",
      mediaId: "media:one",
      mediaRef: "media://local/v2/chat/a".padEnd(60, "0") + ".png",
      mimeType: "image/png",
      width: 100,
    }],
    idempotencyKey: "key:two",
  });
  assert.equal(image.attachments.length, 1);
  assert.throws(() => createV2ChatMessage({
    messageId: "message:three",
    conversationId: "conversation:one",
    role: "user",
    idempotencyKey: "key:three",
  }));
});

test("chat domain creates media and memory with constraints", () => {
  const media = createV2ChatMedia({
    mediaId: "media:one",
    contentHash: "a".repeat(64),
    mediaRef: "media://local/v2/chat/a".padEnd(60, "0") + ".png",
    mimeType: "image/png",
    byteSize: 10,
    width: 10,
    height: 10,
  });
  assert.equal(media.byteSize, 10);

  const memory = createV2Memory({
    memoryId: "memory:one",
    storyWorldId: "world:one",
    scopeType: "user",
    scopeId: "user:local",
    kind: "preference",
    content: "用户不喜欢香菜",
    importance: 0.65,
    confidence: 0.98,
    sourceMessageIds: ["message:one"],
  });
  assert.equal(memory.status, "active");
  assert.throws(() => createV2Memory({
    memoryId: "memory:two",
    storyWorldId: "world:one",
    scopeType: "user",
    scopeId: "user:local",
    kind: "preference",
    content: "bad",
    importance: 2,
    confidence: 1,
    sourceMessageIds: [],
  }));
});
