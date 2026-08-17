import assert from "node:assert/strict";
import test from "node:test";

import { prepareV2ChatReply, prepareV2StoryBootstrap, prepareV2Prompt, PromptBudgetExceededError } from "./index.ts";

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
  assert.ok(prompt.estimatedTokens <= prompt.budget.inputBudget);
  assert.ok(prompt.messages.some((message) => message.role === "user" && String(message.content).includes("那太好了。")));
  assert.ok(String(prompt.messages[0]?.content).includes("花火是一个爱笑、嘴硬心软的角色。"));
});

test("prompt engine hard budget keeps persona/current input and trims history", () => {
  const recentMessages = Array.from({ length: 50 }, (_, index) => ({
    role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    text: `历史消息 ${index} 的内容足够长用于占用预算。`,
    imageCount: 0,
  }));
  const prompt = prepareV2ChatReply({
    task: "chat.reply",
    tokenBudget: 1024,
    contextWindow: 1024,
    persona: { name: "花火", personaText: "花火是一个爱笑、嘴硬心软的角色。" },
    memories: [],
    recentMessages,
    currentInput: { text: "当前问题", imageCount: 0 },
  });
  assert.ok(prompt.estimatedTokens <= prompt.budget.inputBudget);
  assert.ok(prompt.messages.some((message) => message.role === "user" && String(message.content).includes("当前问题")));
  assert.ok(prompt.messages[0]?.content !== undefined && String(prompt.messages[0].content).includes("花火"));
  assert.ok(prompt.budget.recentMessageTokens < recentMessages.reduce((total, message) => total + message.text.length, 0));
});

test("prompt engine rejects persona/current input that exceed budget", () => {
  assert.throws(
    () => prepareV2ChatReply({
      task: "chat.reply",
      tokenBudget: 64,
      persona: { name: "花火", personaText: "非常非常长的角色设定，远超预算。" },
      memories: [],
      recentMessages: [],
      currentInput: { text: "当前输入", imageCount: 0 },
    }),
    (error: unknown) => error instanceof PromptBudgetExceededError,
  );
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
    tokenBudget: 2048,
    persona: { name: "角色", personaText: "人设" },
    memories: [],
    recentMessages: [],
    currentInput: { text: "开始", imageCount: 0 },
  });
  assert.equal(prompt.templateId, "chat-reply-v1");
});
