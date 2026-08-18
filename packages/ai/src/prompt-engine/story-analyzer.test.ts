import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStoryAnalyzerPrompt,
  parseStoryAnalyzerOutput,
  StructuredOutputError,
} from "./story-analyzer.ts";

test("buildStoryAnalyzerPrompt constructs rich context for story analysis", () => {
  const prompt = buildStoryAnalyzerPrompt({
    worldName: "星穹列车",
    worldSummary: "行驶在星海中的梦幻列车",
    characterName: "三月七",
    personaText: "活泼开朗，爱拍照的少女",
    conversationSummary: "主角与三月七探索了车厢并谈到了过往的冒险。",
    memories: ["用户喜欢拍照留念", "三月七最喜欢的相机品牌是特斯卡"],
    messages: [
      { role: "user", text: "三月七，我们要不要去观景车厢看看帕姆？" },
      { role: "assistant", text: "好呀！我刚好拍了几张新照片要给列车长看呢！" },
    ],
  });

  assert.ok(prompt.system.includes("Story Analyzer"));
  assert.ok(prompt.user.includes("星穹列车"));
  assert.ok(prompt.user.includes("三月七"));
  assert.ok(prompt.user.includes("观景车厢"));
  assert.ok(prompt.user.includes("用户喜欢拍照留念"));
});

test("parseStoryAnalyzerOutput extracts structured scenes and choices", () => {
  const rawOutput = `
\`\`\`json
{
  "scenes": [
    {
      "title": "观景车厢的会面",
      "body": "开拓者与三月七一起来到观景车厢，车厢内温暖明亮。列车长帕姆正站在窗前眺望星海。",
      "choices": [
        {
          "label": "上前向帕姆展示照片",
          "consequenceSummary": "帕姆高兴地夸奖了大家"
        },
        {
          "label": "默默在一旁喝咖啡观察",
          "consequenceSummary": "触发与姬子的额外对话"
        }
      ]
    }
  ]
}
\`\`\`
`;

  const parsed = parseStoryAnalyzerOutput(rawOutput);
  assert.equal(parsed.scenes.length, 1);
  assert.equal(parsed.scenes[0]?.title, "观景车厢的会面");
  assert.equal(parsed.scenes[0]?.choices.length, 2);
  assert.equal(parsed.scenes[0]?.choices[0]?.label, "上前向帕姆展示照片");
  assert.equal(parsed.scenes[0]?.choices[0]?.consequenceSummary, "帕姆高兴地夸奖了大家");
});

test("parseStoryAnalyzerOutput fails fast on invalid json", () => {
  assert.throws(
    () => parseStoryAnalyzerOutput("invalid text that is not json"),
    (error: unknown) => error instanceof StructuredOutputError && error.code === "INVALID_JSON",
  );
});

test("parseStoryAnalyzerOutput fails fast on invalid schema and empty scenes", () => {
  assert.throws(
    () => parseStoryAnalyzerOutput(JSON.stringify({ notScenes: [] })),
    (error: unknown) => error instanceof StructuredOutputError && error.code === "INVALID_SCHEMA",
  );
  assert.throws(
    () => parseStoryAnalyzerOutput(JSON.stringify({ scenes: [] })),
    (error: unknown) => error instanceof StructuredOutputError && error.code === "EMPTY_OUTPUT",
  );
  assert.throws(
    () => parseStoryAnalyzerOutput(JSON.stringify({ scenes: [{ title: 42, body: "x" }] })),
    (error: unknown) => error instanceof StructuredOutputError && error.code === "INVALID_SCHEMA",
  );
});
