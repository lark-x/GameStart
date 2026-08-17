import assert from "node:assert/strict";
import test from "node:test";

import { prepareV2ChatReply, prepareV2StoryBootstrap, prepareV2Prompt } from "./index.ts";

test("prompt engine assembles chat.reply with persona and memory", () => {
  const prompt = prepareV2ChatReply({
    task: "chat.reply",
    tokenBudget: 1024,
    persona: { name: "花火", personaText: "花火是一个爱笑、嘴硬心软的角色。" },
    memories: [{ memoryId: "memory:1", kind: "preference", content: "用户不喜欢香菜", importance: 0.7, confidence: 0.9 }],
    recentMessages: [
      { role: "user", text: "你喜欢吃香菜吗？", imageCount: 0 },
      { role: "assistant", text: "不喜欢。", imageCount: 0 },
    ],
    currentInput: { text: "那太好了。", imageCount: 0 },
  });
  assert.equal(prompt.templateId, "chat-reply-v1");
  assert.ok(prompt.estimatedTokens > 0);
  assert.ok(prompt.contextHash.length === 64);
  assert.ok(prompt.messages[0]?.role === "system");
  assert.ok(prompt.sources.some((source) => source.kind === "memory"));
  assert.ok(prompt.budget.inputBudget > 0);
  assert.ok(prompt.budget.usedTokens > 0);
});

test("prompt engine supports story.bootstrap and deterministic context hash", () => {
  const context = {
    task: "story.bootstrap" as const,
    tokenBudget: 1024,
    persona: { name: "花火", personaText: "花火是一个爱笑的人。" },
    memories: [],
    recentMessages: [],
  };
  const first = prepareV2StoryBootstrap(context);
  const second = prepareV2StoryBootstrap(context);
  assert.equal(first.templateId, "story-bootstrap-v1");
  assert.equal(first.contextHash, second.contextHash);
});

test("registry dispatches by task", () => {
  const prompt = prepareV2Prompt({
    task: "chat.reply",
    tokenBudget: 256,
    persona: { name: "角色", personaText: "人设" },
    memories: [],
    recentMessages: [],
    currentInput: { text: "开始", imageCount: 0 },
  });
  assert.equal(prompt.templateId, "chat-reply-v1");
});
