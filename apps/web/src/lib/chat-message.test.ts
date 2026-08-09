import assert from "node:assert/strict";
import test from "node:test";
import { splitChatMessage } from "./chat-message.ts";

test("splits internal thought and debug blocks from visible chat text", () => {
  const result = splitChatMessage("你好\n<think>internal plan</think>\nDEBUG: provider=demo\n这是给体验者看的回复");
  assert.equal(result.body, "你好\n\n\n这是给体验者看的回复".replace(/\n{3,}/g, "\n\n"));
  assert.deepEqual(result.extras, ["think: internal plan", "provider=demo"]);
});

test("keeps ordinary markdown code blocks in the chat bubble", () => {
  const result = splitChatMessage("## 示例\n\n**代码**：\n```ts\nconst value = 1;\n```\n[文档](https://example.com/docs)");
  assert.equal(result.extras.length, 0);
  assert.match(result.body, /const value = 1/);
  assert.equal(result.body.includes("**"), false);
  assert.equal(result.body.includes("```"), false);
  assert.match(result.body, /文档 \(https:\/\/example.com\/docs\)/);
});
