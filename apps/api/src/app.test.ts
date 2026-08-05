import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  StoryMode,
  createActorSession,
  createCharacter,
  createCharacterVisualIdentity,
  createImageWorkflowTemplate,
  createStoryWorld,
} from "../../../packages/domain/src/index.ts";
import { ApiApplication, createApiStore } from "./index.ts";

const world = createStoryWorld({
  id: "world-api",
  name: "API Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const firstUser = createCharacter({
  id: "user-first",
  displayName: "First User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const secondUser = createCharacter({
  id: "user-second",
  displayName: "Second User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const aiCharacter = createCharacter({
  id: "ai-character",
  displayName: "AI Character",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const session = createActorSession({
  id: "session-api",
  storyWorld: world,
  userCharacter: firstUser,
  startedAt: "2026-08-05T09:00:00.000Z",
});
const visualIdentity = createCharacterVisualIdentity({
  id: "visual-api-identity",
  characterId: aiCharacter.id,
  storyWorldId: world.id,
  positivePrompt: "blue-haired cartographer",
  styleTags: ["anime illustration"],
  referenceImageRefs: ["media://api/reference.png"],
  updatedAt: "2026-08-05T09:00:00.000Z",
});
const workflowTemplate = createImageWorkflowTemplate({
  id: "api-moment",
  version: "v1",
  workflow: { node: { inputs: { text: "placeholder" } } },
  positivePromptPath: ["node", "inputs", "text"],
});

function createApplication(): ApiApplication {
  return new ApiApplication(
    createApiStore({
      worlds: [world],
      characters: [firstUser, secondUser, aiCharacter],
      actorSessions: [session],
      characterVisualIdentities: [visualIdentity],
      imageWorkflowTemplates: [workflowTemplate],
    }),
  );
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

test("serves health, world listing, and filtered character listing", async () => {
  const application = createApplication();

  const health = await application.handle(new Request("http://localhost/health"));
  assert.equal(health.status, 200);
  assert.deepEqual(await json(health), { status: "ok" });

  const worlds = await application.handle(new Request("http://localhost/v1/worlds"));
  assert.equal(worlds.status, 200);
  assert.deepEqual(await json(worlds), {
    data: [
      {
        id: "world-api",
        name: "API Story",
        timezone: "Asia/Shanghai",
        storyMode: "STATIC",
        relationshipDynamicsEnabled: false,
      },
    ],
  });

  const characters = await application.handle(
    new Request("http://localhost/v1/characters?storyWorldId=world-api"),
  );
  assert.equal(characters.status, 200);
  assert.deepEqual((await json(characters)) as { data: unknown[] }, {
    data: [firstUser, secondUser, aiCharacter],
  });
});

test("serves character visual identity and versioned workflow templates", async () => {
  const application = createApplication();
  const identityResponse = await application.handle(
    new Request(`http://localhost/v1/characters/${aiCharacter.id}/visual-identity`),
  );
  assert.equal(identityResponse.status, 200);
  assert.deepEqual(await json(identityResponse), { data: visualIdentity });

  const workflowsResponse = await application.handle(
    new Request("http://localhost/v1/comfyui/workflows"),
  );
  assert.equal(workflowsResponse.status, 200);
  assert.deepEqual(await json(workflowsResponse), { data: [workflowTemplate] });

  const missing = await application.handle(
    new Request("http://localhost/v1/characters/missing/visual-identity"),
  );
  assert.equal(missing.status, 404);
});

test("switches the actor session through the domain rule and persists it", async () => {
  const application = createApplication();
  const response = await application.handle(
    new Request("http://localhost/v1/actor-sessions/switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorSessionId: session.id,
        nextCharacterId: secondUser.id,
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), {
    data: {
      id: session.id,
      storyWorldId: world.id,
      userCharacterId: secondUser.id,
      startedAt: session.startedAt,
    },
  });
  assert.equal(
    (await application.store.actorSessions.getById(session.id))?.userCharacterId,
    secondUser.id,
  );
});

test("returns bounded errors for malformed input, forbidden role, and unknown routes", async () => {
  const application = createApplication();

  const malformed = await application.handle(
    new Request("http://localhost/v1/actor-sessions/switch", {
      method: "POST",
      body: "not-json",
    }),
  );
  assert.equal(malformed.status, 400);
  assert.deepEqual(await json(malformed), {
    error: { code: "BAD_REQUEST", message: "Request body must be valid JSON" },
  });

  const aiSwitch = await application.handle(
    new Request("http://localhost/v1/actor-sessions/switch", {
      method: "POST",
      body: JSON.stringify({
        actorSessionId: session.id,
        nextCharacterId: aiCharacter.id,
      }),
    }),
  );
  assert.equal(aiSwitch.status, 400);
  assert.match(JSON.stringify(await json(aiSwitch)), /role USER/);

  const unknown = await application.handle(new Request("http://localhost/not-found"));
  assert.equal(unknown.status, 404);
});

test("rejects a seed session that points at an AI character", () => {
  assert.throws(
    () =>
      createApiStore({
        worlds: [world],
        characters: [aiCharacter],
        actorSessions: [{ ...session, userCharacterId: aiCharacter.id }],
      }),
    { name: "TypeError", message: /invalid user character/ },
  );
});

test("does not accept unsupported methods on known routes", async () => {
  const response = await createApplication().handle(
    new Request("http://localhost/v1/worlds", { method: "POST", body: "{}" }),
  );
  assert.equal(response.status, 405);
});
