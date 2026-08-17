import assert from "node:assert/strict";
import test from "node:test";

import { prepareV2ConversationSummary } from "./index.ts";

test("conversation.summary prompt template is registered", () => {
  const prompt = prepareV2ConversationSummary({
    task: "conversation.summary",
    tokenBudget: 2048,
    persona: { name: "花火", personaText: "花火是角色" },
    memories: [],
    sessionSummary: "之前剧情：两人在桥上相遇。",
    recentMessages: [
      { role: "user", text: "我们接下来去哪？", imageCount: 0 },
      { role: "assistant", text: "去旧书店。", imageCount: 0 },
    ],
  });
  assert.equal(prompt.templateId, "conversation-summary-v1");
  assert.ok(prompt.messages.length >= 2);
});
