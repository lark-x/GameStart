import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  ConversationType,
  StoryMode,
  createCharacter,
  createConversation,
  createStoryWorld,
} from "../../../packages/domain/src/index.ts";
import { ApiApplication, createApiStore } from "./index.ts";

const createdAt = "2026-08-09T08:00:00.000Z";
const world = createStoryWorld({
  id: "conversation-image-world",
  name: "Conversation image world",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const actor = createCharacter({
  id: "conversation-image-user",
  displayName: "User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const recipient = createCharacter({
  id: "conversation-image-ai",
  displayName: "Assistant",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const privateConversation = createConversation({
  id: "conversation-image-private",
  storyWorld: world,
  type: ConversationType.PRIVATE,
  members: [actor, recipient],
  createdAt,
});

function app() {
  return new ApiApplication(createApiStore({
    worlds: [world],
    characters: [actor, recipient],
    conversations: [privateConversation],
  }));
}

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    actorCharacterId: actor.id,
    recipientCharacterId: recipient.id,
    prompt: "A quiet rainy cafe at dusk",
    workflowVersion: "portrait@v1",
    createdAt,
    idempotencyKey: "request-1",
    ...overrides,
  };
}

test("queues a private conversation image request and is idempotent", async () => {
  const application = app();
  const url = `http://localhost/v1/conversations/${privateConversation.conversation.id}/image-jobs`;
  const first = await application.handle(new Request(url, {
    method: "POST",
    body: JSON.stringify(requestBody()),
  }));
  assert.equal(first.status, 201);
  const firstPayload = await first.json() as { data: { id: string; status: string; actionId: string; ownerCharacterId: string; prompt: string } };
  assert.equal(firstPayload.data.status, "QUEUED");
  assert.equal(firstPayload.data.ownerCharacterId, actor.id);
  assert.equal(firstPayload.data.prompt, "A quiet rainy cafe at dusk");

  const again = await application.handle(new Request(url, {
    method: "POST",
    body: JSON.stringify(requestBody()),
  }));
  assert.equal(again.status, 201);
  const againPayload = await again.json() as { data: { id: string; actionId: string } };
  assert.equal(againPayload.data.id, firstPayload.data.id);
  assert.equal(againPayload.data.actionId, firstPayload.data.actionId);

  const status = await application.handle(new Request(
    `http://localhost/v1/image-jobs/${encodeURIComponent(firstPayload.data.id)}`,
  ));
  assert.equal(status.status, 200);
});

test("rejects a non-member recipient and mismatched idempotent retry", async () => {
  const application = app();
  const url = `http://localhost/v1/conversations/${privateConversation.conversation.id}/image-jobs`;
  const forbidden = await application.handle(new Request(url, {
    method: "POST",
    body: JSON.stringify(requestBody({ recipientCharacterId: "not-a-member" })),
  }));
  assert.equal(forbidden.status, 403);

  assert.equal((await application.handle(new Request(url, {
    method: "POST", body: JSON.stringify(requestBody()),
  }))).status, 201);
  const conflict = await application.handle(new Request(url, {
    method: "POST",
    body: JSON.stringify(requestBody({ prompt: "different prompt" })),
  }));
  assert.equal(conflict.status, 409);
});
