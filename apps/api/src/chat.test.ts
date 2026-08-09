import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  StoryMode,
  createCharacter,
  createStoryWorld,
} from "../../../packages/domain/src/index.ts";
import { ApiApplication, createApiStore } from "./index.ts";

const world = createStoryWorld({
  id: "world-api-chat",
  name: "API Chat Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const user = createCharacter({
  id: "api-chat-user",
  displayName: "Chat User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const ai = createCharacter({
  id: "api-chat-ai",
  displayName: "Chat AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const outsider = createCharacter({
  id: "api-chat-outsider",
  displayName: "Outsider",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});

function application(): ApiApplication {
  return new ApiApplication(
    createApiStore({
      worlds: [world],
      characters: [user, ai, outsider],
    }),
  );
}

async function json(response: Response): Promise<any> {
  return response.json();
}

async function createPrivateConversation(app: ApiApplication): Promise<string> {
  const response = await app.handle(
    new Request("http://localhost/v1/conversations", {
      method: "POST",
      body: JSON.stringify({
        id: "api-conversation",
        storyWorldId: world.id,
        type: "PRIVATE",
        createdAt: "2026-08-05T14:00:00.000Z",
        memberCharacterIds: [user.id, ai.id],
      }),
    }),
  );
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.equal(body.data.conversation.id, "api-conversation");
  return body.data.conversation.id;
}

test("creates and lists private conversations for an active member", async () => {
  const app = application();
  await createPrivateConversation(app);

  const response = await app.handle(
    new Request(`http://localhost/v1/conversations?characterId=${user.id}`),
  );
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.equal(body.data.length, 1);
  assert.deepEqual(body.data[0].members.map((member: { characterId: string }) => member.characterId), [
    user.id,
    ai.id,
  ]);
});

test("sends, reads, and idempotently replays a message", async () => {
  const app = application();
  const conversationId = await createPrivateConversation(app);
  const messageUrl = `http://localhost/v1/conversations/${conversationId}/messages`;
  const payload = {
    id: "api-message-1",
    authorCharacterId: user.id,
    kind: "TEXT",
    text: "Hello API",
    createdAt: "2026-08-05T14:01:00.000Z",
    idempotencyKey: "api-message-key",
  };

  const sent = await app.handle(
    new Request(messageUrl, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  );
  assert.equal(sent.status, 200);
  const sentData = (await json(sent)).data;
  assert.deepEqual(sentData.message, {
    id: payload.id,
    conversationId,
    authorCharacterId: user.id,
    kind: "TEXT",
    text: payload.text,
    createdAt: payload.createdAt,
    idempotencyKey: payload.idempotencyKey,
  });
  assert.equal(sentData.inserted, true);
  assert.equal(sentData.autoReply.status, "NOT_APPLICABLE");
  assert.equal(sentData.autoReply.sourceMessageId, payload.id);
  assert.equal(typeof sentData.autoReply.correlationId, "string");
  const replay = await app.handle(
    new Request(messageUrl, {
      method: "POST",
      body: JSON.stringify({ ...payload, id: "api-message-retry" }),
    }),
  );
  assert.equal(replay.status, 200);
  assert.equal((await json(replay)).data.inserted, false);
  assert.equal((await json(await app.handle(
    new Request(`${messageUrl}?characterId=${user.id}`),
  ))).data[0].id, payload.id);
});

test("rejects conflicting idempotency payload and non-member reads", async () => {
  const app = application();
  const conversationId = await createPrivateConversation(app);
  const messageUrl = `http://localhost/v1/conversations/${conversationId}/messages`;
  const base = {
    id: "api-message-conflict",
    authorCharacterId: user.id,
    kind: "TEXT",
    text: "first",
    createdAt: "2026-08-05T14:02:00.000Z",
    idempotencyKey: "conflict-key",
  };
  assert.equal(
    (await app.handle(new Request(messageUrl, { method: "POST", body: JSON.stringify(base) }))).status,
    200,
  );
  const conflict = await app.handle(
    new Request(messageUrl, {
      method: "POST",
      body: JSON.stringify({ ...base, id: "other-id", text: "second" }),
    }),
  );
  assert.equal(conflict.status, 409);

  const forbidden = await app.handle(
    new Request(`${messageUrl}?characterId=${outsider.id}`),
  );
  assert.equal(forbidden.status, 403);
});

test("supports system messages without an author", async () => {
  const app = application();
  const conversationId = await createPrivateConversation(app);
  const response = await app.handle(
    new Request(`http://localhost/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        id: "system-message",
        kind: "SYSTEM",
        text: "Conversation started",
        createdAt: "2026-08-05T14:03:00.000Z",
        idempotencyKey: "system-message-key",
      }),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await json(response)).data.message.authorCharacterId, undefined);
});
