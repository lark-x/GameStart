import assert from "node:assert/strict";
import test from "node:test";

import { createV2CanonWorld, createV2ChatConversation, createV2ChatMessage, createV2Memory } from "@living-network/domain/v2";

import { applyV2Migrations, openV2TempSqliteConnection } from "../platform/index.ts";
import { V2SqliteChatUnitOfWork } from "./repository.ts";

test("V2 chat SQLite repository persists conversations, messages, and memories", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);

    const world = await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:chat",
      name: "Chat World",
    })));
    assert.equal(world.storyWorldId, "world:chat");

    const conversation = await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:one",
      storyWorldId: "world:chat",
      primaryCharacterId: "character:one",
      title: "花火",
    })));
    assert.equal(conversation.title, "花火");

    const message = await unit.withChatTransaction(async ({ messages, conversations }) => {
      await conversations.touchLastMessage({ conversationId: "conversation:one" as never, lastMessageAt: new Date().toISOString() });
      return messages.create(createV2ChatMessage({
        messageId: "message:one",
        conversationId: "conversation:one",
        role: "user",
        text: "我的生日是 3 月 12 日。",
        idempotencyKey: "key:one",
      }));
    });
    assert.equal(message.text, "我的生日是 3 月 12 日。");

    const memory = await unit.withChatTransaction(async ({ memories }) => memories.create(createV2Memory({
      memoryId: "memory:one",
      storyWorldId: "world:chat",
      conversationId: "conversation:one",
      kind: "profile",
      content: "用户的生日是 3 月 12 日",
      importance: 0.8,
      confidence: 0.95,
      sourceMessageIds: ["message:one"],
    })));
    assert.equal(memory.status, "active");

    const found = await unit.withChatTransaction(async ({ memories }) => memories.searchActive({
      storyWorldId: "world:chat" as never,
      query: "生日",
      limit: 5,
    }));
    assert.equal(found.length, 1);
    assert.equal(found[0]?.memoryId, "memory:one");

    const history = await unit.withChatTransaction(async ({ messages }) => messages.listByConversation("conversation:one" as never));
    assert.equal(history.length, 1);
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});
