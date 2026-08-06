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

test("creates and updates story worlds and characters through CRUD routes", async () => {
  const application = createApplication();

  const newWorld = await application.handle(
    new Request("http://localhost/v1/worlds", {
      method: "POST",
      body: JSON.stringify({
        id: "world-crud",
        name: "CRUD World",
        timezone: "Asia/Tokyo",
        storyMode: "DYNAMIC",
        relationshipDynamicsEnabled: true,
      }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(newWorld.status, 201);
  const createdWorld = (await json(newWorld)) as { data: { id: string; name: string } };
  assert.equal(createdWorld.data.id, "world-crud");
  assert.equal(createdWorld.data.name, "CRUD World");

  const updatedWorld = await application.handle(
    new Request("http://localhost/v1/worlds/world-crud", {
      method: "PUT",
      body: JSON.stringify({ name: "Updated World" }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(updatedWorld.status, 200);
  const worldResult = (await json(updatedWorld)) as { data: { name: string } };
  assert.equal(worldResult.data.name, "Updated World");

  const modeOnlyUpdate = await application.handle(
    new Request("http://localhost/v1/worlds/world-crud", {
      method: "PUT",
      body: JSON.stringify({ storyMode: "STATIC" }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(modeOnlyUpdate.status, 200);
  assert.deepEqual((await json(modeOnlyUpdate) as { data: unknown }).data, {
    id: "world-crud",
    name: "Updated World",
    timezone: "Asia/Tokyo",
    storyMode: "STATIC",
    relationshipDynamicsEnabled: false,
  });

  const newChar = await application.handle(
    new Request("http://localhost/v1/characters", {
      method: "POST",
      body: JSON.stringify({
        id: "char-crud",
        displayName: "CRUD Char",
        role: "AI",
        storyWorldId: "world-api",
        timezone: "Asia/Shanghai",
      }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(newChar.status, 201);
  const createdChar = (await json(newChar)) as { data: { id: string; displayName: string } };
  assert.equal(createdChar.data.id, "char-crud");
  assert.equal(createdChar.data.displayName, "CRUD Char");

  const duplicateWorld = await application.handle(
    new Request("http://localhost/v1/worlds", {
      method: "POST",
      body: JSON.stringify({
        id: "world-crud",
        name: "Duplicate",
        timezone: "Asia/Tokyo",
        storyMode: "STATIC",
        relationshipDynamicsEnabled: false,
      }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(duplicateWorld.status, 409);

  const orphanCharacter = await application.handle(
    new Request("http://localhost/v1/characters", {
      method: "POST",
      body: JSON.stringify({
        id: "char-orphan",
        displayName: "Orphan",
        role: "AI",
        storyWorldId: "missing-world",
        timezone: "Asia/Shanghai",
      }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(orphanCharacter.status, 404);

  const relationship = await application.handle(
    new Request("http://localhost/v1/relationships", {
      method: "POST",
      body: JSON.stringify({
        id: "relationship-crud",
        sourceCharacterId: "user-first",
        targetCharacterId: "char-crud",
        storyWorldId: "world-api",
        relationshipType: "collaborator",
        initialState: { affinity: 20, trust: 30, conflict: 0, dependency: 0 },
        isPublic: true,
        isBidirectional: true,
      }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(relationship.status, 201);

  const updatedRelationship = await application.handle(
    new Request("http://localhost/v1/relationships/relationship-crud", {
      method: "PUT",
      body: JSON.stringify({ relationshipType: "trusted collaborator", isPublic: false }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(updatedRelationship.status, 200);
  const updatedRelationshipData = (await json(updatedRelationship) as {
    data: { relationshipType: string; isPublic: boolean };
  }).data;
  assert.equal(updatedRelationshipData.relationshipType, "trusted collaborator");
  assert.equal(updatedRelationshipData.isPublic, false);

  const event = await application.handle(
    new Request("http://localhost/v1/world-events", {
      method: "POST",
      body: JSON.stringify({
        id: "event-crud",
        storyWorldId: "world-api",
        eventKey: "crud:welcome",
        name: "Welcome event",
        triggerSource: "MANUAL",
        recurrence: { kind: "ONCE", runAt: "2026-08-10T12:00:00.000Z" },
        targetCharacterIds: ["char-crud"],
        createdAt: "2026-08-06T00:00:00.000Z",
      }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(event.status, 201);

  const updatedEvent = await application.handle(
    new Request("http://localhost/v1/world-events/event-crud", {
      method: "PUT",
      body: JSON.stringify({ name: "Updated welcome event", enabled: false }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(updatedEvent.status, 200);
  const updatedEventData = (await json(updatedEvent) as { data: { name: string; enabled: boolean } }).data;
  assert.equal(updatedEventData.name, "Updated welcome event");
  assert.equal(updatedEventData.enabled, false);

  const events = await application.handle(
    new Request("http://localhost/v1/world-events?storyWorldId=world-api"),
  );
  assert.equal(events.status, 200);
  assert.equal((await json(events) as { data: Array<{ id: string }> }).data[0]?.id, "event-crud");

  const updatedChar = await application.handle(
    new Request("http://localhost/v1/characters/char-crud", {
      method: "PUT",
      body: JSON.stringify({ displayName: "Updated Char" }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(updatedChar.status, 200);
  const charResult = (await json(updatedChar)) as { data: { displayName: string } };
  assert.equal(charResult.data.displayName, "Updated Char");

  const notFoundWorld = await application.handle(
    new Request("http://localhost/v1/worlds/nope", {
      method: "PUT",
      body: JSON.stringify({ name: "X" }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(notFoundWorld.status, 404);

  const notFoundChar = await application.handle(
    new Request("http://localhost/v1/characters/nope", {
      method: "PUT",
      body: JSON.stringify({ displayName: "X" }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(notFoundChar.status, 404);
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
    new Request("http://localhost/v1/worlds/world-api/calendar", { method: "POST", body: "{}" }),
  );
  assert.equal(response.status, 405);
});

test("bounds content editor conflicts, references, and query requirements", async () => {
  const application = createApplication();
  const relationshipBody = {
    id: "relationship-edge-cases",
    sourceCharacterId: firstUser.id,
    targetCharacterId: aiCharacter.id,
    storyWorldId: world.id,
    relationshipType: "ally",
    initialState: { affinity: 10, trust: 10, conflict: 0, dependency: 0 },
    isPublic: true,
    isBidirectional: false,
  };
  const createdRelationship = await application.handle(new Request("http://localhost/v1/relationships", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(relationshipBody),
  }));
  assert.equal(createdRelationship.status, 201);
  const duplicateRelationship = await application.handle(new Request("http://localhost/v1/relationships", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(relationshipBody),
  }));
  assert.equal(duplicateRelationship.status, 409);

  const invalidRelationship = await application.handle(new Request("http://localhost/v1/relationships", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...relationshipBody, id: "relationship-invalid", initialState: { ...relationshipBody.initialState, trust: 101 } }),
  }));
  assert.equal(invalidRelationship.status, 400);

  const missingTargetEvent = await application.handle(new Request("http://localhost/v1/world-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "event-missing-target",
      storyWorldId: world.id,
      eventKey: "edge:missing-target",
      name: "Missing target",
      triggerSource: "MANUAL",
      recurrence: { kind: "ONCE", runAt: "2026-08-10T12:00:00.000Z" },
      targetCharacterIds: ["missing-character"],
      createdAt: "2026-08-06T00:00:00.000Z",
    }),
  }));
  assert.equal(missingTargetEvent.status, 404);

  const missingWorldQuery = await application.handle(new Request("http://localhost/v1/world-events"));
  assert.equal(missingWorldQuery.status, 400);
  const unknownWorldQuery = await application.handle(new Request("http://localhost/v1/world-events?storyWorldId=missing-world"));
  assert.equal(unknownWorldQuery.status, 404);
});
