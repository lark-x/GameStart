import assert from "node:assert/strict";
import test from "node:test";

import {
  ProviderError,
  type ChatCompletionResult,
  type ChatDelta,
  type ChatProvider,
  type ChatMessage,
} from "@living-network/ai";
import {
  CharacterRole,
  StoryMode,
  createCharacter,
  createStoryWorld,
} from "@living-network/domain";
import { ApiApplication, createApiStore } from "./index.ts";

const world = createStoryWorld({
  id: "world-sse",
  name: "SSE Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const user = createCharacter({
  id: "sse-user",
  displayName: "SSE User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const ai = createCharacter({
  id: "sse-ai",
  displayName: "SSE AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});

function chatProvider(
  stream: (messages: readonly ChatMessage[]) => AsyncIterable<ChatDelta>,
): ChatProvider {
  return {
    complete: async (): Promise<ChatCompletionResult> => ({
      id: "unused",
      model: "unused",
      content: "unused",
    }),
    stream: async function* ({ messages }) {
      yield* stream(messages);
    },
  };
}

async function createApplication(provider: ChatProvider): Promise<ApiApplication> {
  const app = new ApiApplication(
    createApiStore({ worlds: [world], characters: [user, ai] }),
    provider,
  );
  const conversation = await app.handle(new Request("http://localhost/v1/conversations", {
    method: "POST",
    body: JSON.stringify({
      id: "sse-conversation",
      storyWorldId: world.id,
      type: "PRIVATE",
      createdAt: "2026-08-05T15:00:00.000Z",
      memberCharacterIds: [user.id, ai.id],
    }),
  }));
  assert.equal(conversation.status, 200);
  const message = await app.handle(new Request(
    "http://localhost/v1/conversations/sse-conversation/messages",
    {
      method: "POST",
      body: JSON.stringify({
        id: "sse-user-message",
        authorCharacterId: user.id,
        kind: "TEXT",
        text: "Tell me a story",
        createdAt: "2026-08-05T15:01:00.000Z",
        idempotencyKey: "sse-user-message-key",
      }),
    },
  ));
  assert.equal(message.status, 200);
  return app;
}

test("streams provider deltas as SSE and preserves conversation history", async () => {
  let received: readonly ChatMessage[] = [];
  const provider = chatProvider(async function* (messages) {
    received = messages;
    yield { content: "Once" };
    yield { content: " upon", finishReason: "stop" };
  });
  const app = await createApplication(provider);
  const response = await app.handle(
    new Request("http://localhost/v1/conversations/sse-conversation/stream?characterId=sse-user"),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.equal(await response.text(),
    'data: {"content":"Once"}\n\n' +
    'data: {"content":" upon","finishReason":"stop"}\n\n' +
    "data: [DONE]\n\n",
  );
  assert.deepEqual(received, [{ role: "user", content: "Tell me a story" }]);
});

test("emits bounded SSE error events and returns 501 without provider", async () => {
  const errorProvider = chatProvider(async function* () {
    throw new ProviderError("HTTP_ERROR", "upstream failed", { status: 503, retryable: true });
  });
  const app = await createApplication(errorProvider);
  const errorResponse = await app.handle(
    new Request("http://localhost/v1/conversations/sse-conversation/stream?characterId=sse-user"),
  );
  const text = await errorResponse.text();
  assert.equal(errorResponse.status, 200);
  assert.match(text, /event: error/);
  assert.match(text, /"code":"HTTP_ERROR"/);
  assert.match(text, /data: \[DONE\]/);
  assert.equal(text.includes("Bearer"), false);

  const noProvider = await createApplication(chatProvider(async function* () {}));
  noProvider.provider;
  const unconfigured = new ApiApplication(
    createApiStore({ worlds: [world], characters: [user, ai] }),
  );
  const response = await unconfigured.handle(
    new Request("http://localhost/v1/conversations/missing/stream?characterId=sse-user"),
  );
  assert.equal(response.status, 501);
});
