import assert from "node:assert/strict";
import test from "node:test";

import { parseV2MemoryConsolidationOutput } from "./memory-consolidation.ts";
import { prepareV2MemoryConsolidate } from "./index.ts";

test("memory consolidation parser accepts valid actions", () => {
  const result = parseV2MemoryConsolidationOutput(JSON.stringify({ action: "supersede", mergedContent: "用户现在戒咖啡", confidence: 0.9 }));
  assert.equal(result.action, "supersede");
  assert.equal(result.mergedContent, "用户现在戒咖啡");
  assert.equal(parseV2MemoryConsolidationOutput(JSON.stringify({ action: "keep_both" })).action, "keep_both");
});

test("memory consolidation parser rejects invalid output", () => {
  assert.throws(() => parseV2MemoryConsolidationOutput("bad"), /not valid JSON/);
  assert.throws(() => parseV2MemoryConsolidationOutput(JSON.stringify({ action: "merge" })), /requires mergedContent/);
  assert.throws(() => parseV2MemoryConsolidationOutput(JSON.stringify({ action: "unknown" })), /action is invalid/);
});

test("memory.consolidate prompt template is registered", () => {
  const prompt = prepareV2MemoryConsolidate({
    task: "memory.consolidate",
    tokenBudget: 1024,
    memories: [{ memoryId: "memory:1", kind: "preference", content: "用户喜欢咖啡", importance: 0.7, confidence: 0.9 }],
    recentMessages: [],
    currentInput: { text: "用户现在戒咖啡", imageCount: 0 },
  });
  assert.equal(prompt.templateId, "memory-consolidate-v1");
});
