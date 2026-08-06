import assert from "node:assert/strict";
import test from "node:test";

import { OpenAICompatibleProvider } from "../packages/ai/src/index.ts";
import { createDevelopmentRepositories } from "../apps/api/src/dev-seed.ts";
import { ApiApplication } from "../apps/api/src/index.ts";

const enabled = process.env.RUN_LLM_ACCEPTANCE === "1";
const baseUrl = process.env.LLM_BASE_URL ?? "";
const apiKey = process.env.LLM_API_KEY ?? "";
const model = process.env.LLM_MODEL ?? "";

test("LLM provider complete returns structured response", { skip: !enabled || !baseUrl }, async () => {
  const provider = new OpenAICompatibleProvider({ baseUrl, apiKey, model });
  const result = await provider.complete({
    messages: [
      { role: "system", content: "You are a helpful assistant. Reply in one sentence." },
      { role: "user", content: "What is 2+2?" },
    ],
    maxTokens: 100,
  });
  assert.ok(result.content.length > 0, "LLM response should not be empty");
  assert.ok(result.model.length > 0, "LLM model should be set");
  console.log(`LLM complete response: ${result.content.slice(0, 100)}`);
});

test("LLM provider stream yields deltas", { skip: !enabled || !baseUrl }, async () => {
  const provider = new OpenAICompatibleProvider({ baseUrl, apiKey, model });
  const chunks: string[] = [];
  for await (const delta of provider.stream({
    messages: [
      { role: "system", content: "You are a helpful assistant. Reply in one sentence." },
      { role: "user", content: "Hello, how are you?" },
    ],
    maxTokens: 50,
  })) {
    if (delta.content) chunks.push(delta.content);
  }
  assert.ok(chunks.length > 0, "Stream should yield at least one delta");
  console.log(`LLM stream response: ${chunks.join("").slice(0, 100)}`);
});

test("real LLM API stream persists the assistant reply and derived memory", { skip: !enabled || !baseUrl }, async () => {
  const repositories = createDevelopmentRepositories();
  const provider = new OpenAICompatibleProvider({ baseUrl, apiKey, model });
  const application = new ApiApplication(
    repositories,
    provider,
    { memoryWriteEnabled: true },
    {},
    {},
  );
  const response = await application.handle(new Request(
    "http://localhost/v1/conversations/dev-conversation/stream?characterId=dev-user",
    { headers: { accept: "text/event-stream" } },
  ));
  assert.equal(response.status, 200);
  const streamText = await response.text();
  assert.match(streamText, /data: \[DONE\]/);

  const messages = await repositories.messages.listByConversation("dev-conversation");
  const assistant = messages.find((message) => message.id.startsWith("assistant:"));
  assert.ok(assistant, "stream completion should persist an assistant message");
  assert.ok(assistant.text && assistant.text.trim().length > 0, "assistant message should contain text");
  const memories = await repositories.memories.listForCharacter("dev-world", "dev-user");
  assert.ok(memories.some((memory) => memory.source === "LLM_DERIVED"), "reply should write a derived memory");
  console.log(`LLM API stream persisted message: ${assistant.id}`);
});
