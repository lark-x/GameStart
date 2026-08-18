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
    const byKey = await unit.withChatTransaction(async ({ messages }) => messages.findByIdempotencyKey("conversation:one" as never, "key:one"));
    assert.equal(byKey?.messageId, "message:one");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});

test("V2 chat message repository returns the latest recent messages and supports idempotency lookup", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);
    await unit.withChatTransaction(async ({ canon }) => canon.createWorld(createV2CanonWorld({
      storyWorldId: "world:recent",
      name: "Recent World",
    })));
    await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:recent",
      storyWorldId: "world:recent",
      primaryCharacterId: "character:one",
    })));

    for (let index = 1; index <= 500; index += 1) {
      await unit.withChatTransaction(async ({ messages }) => messages.create(createV2ChatMessage({
        messageId: `message:recent:${index}`,
        conversationId: "conversation:recent",
        role: index % 2 === 0 ? "assistant" : "user",
        text: `消息 ${index}`,
        idempotencyKey: `recent-key:${index}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      })));
    }

    const recent = await unit.withChatTransaction(async ({ messages }) => messages.listRecentByConversation("conversation:recent" as never, 40));
    assert.equal(recent.length, 40);
    assert.equal(recent[0]?.messageId, "message:recent:461");
    assert.equal(recent.at(-1)?.messageId, "message:recent:500");

    const before = await unit.withChatTransaction(async ({ messages }) => messages.listBefore("conversation:recent" as never, "message:recent:100" as never, 10));
    assert.equal(before.length, 10);
    assert.equal(before[0]?.messageId, "message:recent:90");
    assert.equal(before.at(-1)?.messageId, "message:recent:99");

    const existing = await unit.withChatTransaction(async ({ messages }) => messages.findByIdempotencyKey("conversation:recent" as never, "recent-key:123"));
    assert.equal(existing?.messageId, "message:recent:123");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});
