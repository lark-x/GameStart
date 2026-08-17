import assert from "node:assert/strict";
import test from "node:test";

import { parseV2MemoryExtractionOutput } from "./memory-extraction.ts";
import { prepareV2MemoryExtract } from "./index.ts";

test("memory extraction parser accepts valid structured output", () => {
  const result = parseV2MemoryExtractionOutput(JSON.stringify({
    memories: [
      { kind: "preference", content: "用户不喜欢香菜", importance: 0.7, confidence: 0.95, sourceMessageIds: ["message:1"] },
    ],
  }));
  assert.equal(result.memories.length, 1);
  assert.equal(result.memories[0]?.kind, "preference");
});

test("memory extraction parser rejects invalid output", () => {
  assert.throws(() => parseV2MemoryExtractionOutput("not-json"), /not valid JSON/);
  assert.throws(() => parseV2MemoryExtractionOutput(JSON.stringify({ memories: [{ kind: "bad", content: "x", importance: 0.5, confidence: 0.5, sourceMessageIds: ["m"] }] })), /kind is invalid/);
  assert.deepEqual(parseV2MemoryExtractionOutput(JSON.stringify({ memories: [] })).memories, []);
});

test("memory.extract prompt template is registered", () => {
  const prompt = prepareV2MemoryExtract({
    task: "memory.extract",
    tokenBudget: 2048,
    persona: { name: "花火", personaText: "花火是角色" },
    memories: [],
    recentMessages: [{ role: "user", text: "我的生日是 3 月 12 日。", imageCount: 0 }],
  });
  assert.equal(prompt.templateId, "memory-extract-v1");
  assert.ok(prompt.messages.length >= 2);
});
