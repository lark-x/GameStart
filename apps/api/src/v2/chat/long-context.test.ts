import assert from "node:assert/strict";
import test from "node:test";

import {
  createV2CanonCharacter,
  createV2CanonWorld,
  createV2ChatConversation,
  createV2ChatMessage,
  createV2Memory,
} from "@living-network/domain/v2";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  V2SqliteChatUnitOfWork,
} from "@living-network/database/v2";

import { createV2ChatUseCases } from "./use-cases.ts";

test("V2 chat context stays bounded and memory survives across 500 turns", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const unit = new V2SqliteChatUnitOfWork(temp.db);
    const useCases = createV2ChatUseCases(unit);

    await unit.withChatTransaction(async ({ canon }) => {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world:long", name: "Long World" }));
      await canon.createCharacter(createV2CanonCharacter({
        storyWorldId: "world:long",
        characterId: "character:long",
        name: "花火",
        personaText: "花火是长期陪伴角色。",
      }));
    });
    await unit.withChatTransaction(async ({ conversations }) => conversations.create(createV2ChatConversation({
      conversationId: "conversation:long",
      storyWorldId: "world:long",
      primaryCharacterId: "character:long",
    })));

    const samples: { readonly turn: number; readonly tokens: number; readonly budget: number; readonly recent: number }[] = [];
    for (let turn = 1; turn <= 500; turn += 1) {
      const userText = turn === 10
        ? "我的生日是 3 月 12 日。"
        : turn === 500
          ? "你还记得我的生日吗？"
          : `第 ${turn} 轮用户消息内容，用于构造长对话上下文。`;
      await unit.withChatTransaction(async ({ messages }) => messages.create(createV2ChatMessage({
        messageId: `message:user:${turn}`,
        conversationId: "conversation:long",
        role: "user",
        text: userText,
        idempotencyKey: `user:${turn}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, turn)).toISOString(),
      })));
      await unit.withChatTransaction(async ({ messages }) => messages.create(createV2ChatMessage({
        messageId: `message:assistant:${turn}`,
        conversationId: "conversation:long",
        role: "assistant",
        text: `第 ${turn} 轮回复。`,
        idempotencyKey: `assistant:${turn}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, turn + 0.5)).toISOString(),
      })));
      if (turn === 10) {
        await unit.withChatTransaction(async ({ memories }) => memories.create(createV2Memory({
          memoryId: "memory:birthday",
          storyWorldId: "world:long",
          conversationId: "conversation:long",
          kind: "profile",
          content: "用户生日是 3 月 12 日",
          importance: 0.9,
          confidence: 0.99,
          sourceMessageIds: ["message:user:10"],
        })));
      }
      if (turn % 50 === 0 || turn === 500) {
        const reply = await useCases.prepareReply("conversation:long" as never, { idempotencyKey: `sample:${turn}` as never });
        assert.ok(reply.prompt !== undefined);
        assert.ok(reply.prompt.estimatedTokens <= reply.prompt.budget.inputBudget);
        const recentCount = reply.prompt.sources.filter((source) => source.kind === "message").length;
        samples.push({ turn, tokens: reply.prompt.estimatedTokens, budget: reply.prompt.budget.inputBudget, recent: recentCount });
        assert.ok(recentCount <= 40);
      }
    }

    assert.ok(samples.length >= 10);
    const first = samples[0]!;
    const last = samples.at(-1)!;
    assert.ok(last.tokens <= last.budget);
    assert.ok(last.tokens < first.tokens * 2 + 2000, `context should be bounded: ${last.tokens}`);

    const finalReply = await useCases.prepareReply("conversation:long" as never, { idempotencyKey: "final:birthday" as never });
    assert.ok(finalReply.prompt !== undefined);
    assert.ok(finalReply.prompt.sources.some((source) => source.kind === "memory" && source.id === "memory:birthday"));
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});
