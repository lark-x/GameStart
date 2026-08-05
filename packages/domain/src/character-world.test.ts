import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  StoryMode,
  applyRelationshipDelta,
  assertRelationshipState,
  createActorSession,
  createCharacter,
  createRelationshipEdge,
  createStoryWorld,
  switchActorCharacter,
} from "./index.ts";

const staticWorld = createStoryWorld({
  id: "world-static",
  name: "Static Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});

const dynamicWorld = createStoryWorld({
  id: "world-dynamic",
  name: "Dynamic Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.DYNAMIC,
  relationshipDynamicsEnabled: true,
});

function character(
  id: string,
  role: CharacterRole,
  storyWorldId = staticWorld.id,
) {
  return createCharacter({
    id,
    displayName: id,
    role,
    storyWorldId,
    timezone: "Asia/Shanghai",
    birthDate: "2000-01-01",
  });
}

test("creates characters and preserves optional identity references", () => {
  const input = {
    id: "char-ai",
    displayName: "Ava",
    role: CharacterRole.AI,
    storyWorldId: staticWorld.id,
    timezone: "Asia/Shanghai",
    personaPromptRef: "persona:ava:v1",
    visualPromptRef: "visual:ava:v1",
  } as const;

  const result = createCharacter(input);

  assert.equal(result.role, CharacterRole.AI);
  assert.equal(result.personaPromptRef, "persona:ava:v1");
  assert.deepEqual(input, {
    id: "char-ai",
    displayName: "Ava",
    role: CharacterRole.AI,
    storyWorldId: staticWorld.id,
    timezone: "Asia/Shanghai",
    personaPromptRef: "persona:ava:v1",
    visualPromptRef: "visual:ava:v1",
  });
});

test("requires story mode and relationship dynamics switch to agree", () => {
  assert.throws(
    () =>
      createStoryWorld({
        ...staticWorld,
        relationshipDynamicsEnabled: true,
      }),
    { name: "TypeError", message: /relationshipDynamicsEnabled/ },
  );
  assert.throws(
    () =>
      createStoryWorld({
        ...dynamicWorld,
        relationshipDynamicsEnabled: false,
      }),
    { name: "TypeError", message: /relationshipDynamicsEnabled/ },
  );
});

test("rejects self edges, cross-world edges, and invalid initial state", () => {
  const user = character("char-user", CharacterRole.USER);
  const ai = character("char-ai", CharacterRole.AI);
  const foreign = character("char-foreign", CharacterRole.AI, dynamicWorld.id);
  const state = { affinity: 10, trust: 20, conflict: 0, dependency: -5 };

  assert.throws(
    () =>
      createRelationshipEdge({
        id: "edge-self",
        source: user,
        target: user,
        storyWorld: staticWorld,
        relationshipType: "friend",
        initialState: state,
        isPublic: true,
        isBidirectional: true,
      }),
    { name: "TypeError", message: /cannot be the same/ },
  );
  assert.throws(
    () =>
      createRelationshipEdge({
        id: "edge-cross-world",
        source: user,
        target: foreign,
        storyWorld: staticWorld,
        relationshipType: "friend",
        initialState: state,
        isPublic: true,
        isBidirectional: true,
      }),
    { name: "TypeError", message: /share a story world/ },
  );
  assert.throws(
    () =>
      createRelationshipEdge({
        id: "edge-invalid-state",
        source: user,
        target: ai,
        storyWorld: staticWorld,
        relationshipType: "friend",
        initialState: { ...state, trust: 101 },
        isPublic: true,
        isBidirectional: true,
      }),
    { name: "RangeError", message: /initialState\.trust/ },
  );
  assert.throws(
    () =>
      createRelationshipEdge({
        id: "edge-foreign-world",
        source: user,
        target: ai,
        storyWorld: dynamicWorld,
        relationshipType: "friend",
        initialState: state,
        isPublic: true,
        isBidirectional: true,
      }),
    { name: "TypeError", message: /belong to storyWorld/ },
  );
});

test("creates an edge with cloned initial state", () => {
  const user = character("char-user-edge", CharacterRole.USER);
  const ai = character("char-ai-edge", CharacterRole.AI);
  const state = { affinity: 10, trust: 20, conflict: 0, dependency: -5 };
  const edge = createRelationshipEdge({
    id: "edge-valid",
    source: user,
    target: ai,
    storyWorld: staticWorld,
    relationshipType: "friend",
    initialState: state,
    isPublic: true,
    isBidirectional: false,
  });

  assert.deepEqual(edge.initialState, state);
  assert.notStrictEqual(edge.initialState, state);
  assert.equal(edge.storyWorldId, staticWorld.id);
});

test("only USER characters can create and switch actor sessions", () => {
  const firstUser = character("user-one", CharacterRole.USER);
  const secondUser = character("user-two", CharacterRole.USER);
  const ai = character("ai-one", CharacterRole.AI);
  const foreignUser = character("user-foreign", CharacterRole.USER, dynamicWorld.id);
  const session = createActorSession({
    id: "session-one",
    storyWorld: staticWorld,
    userCharacter: firstUser,
    startedAt: "2026-08-05T08:00:00.000Z",
  });

  const switched = switchActorCharacter(session, secondUser);
  assert.equal(switched.userCharacterId, secondUser.id);
  assert.equal(session.userCharacterId, firstUser.id);

  assert.throws(
    () => switchActorCharacter(session, ai),
    { name: "TypeError", message: /role USER/ },
  );
  assert.throws(
    () => switchActorCharacter(session, foreignUser),
    { name: "TypeError", message: /belong to storyWorld/ },
  );
  assert.throws(
    () =>
      createActorSession({
        id: "session-ai",
        storyWorld: staticWorld,
        userCharacter: ai,
        startedAt: "2026-08-05T08:00:00.000Z",
      }),
    { name: "TypeError", message: /role USER/ },
  );

  const ended = createActorSession({
    id: "session-ended",
    storyWorld: staticWorld,
    userCharacter: firstUser,
    startedAt: "2026-08-05T08:00:00.000Z",
    endedAt: "2026-08-05T09:00:00.000Z",
  });
  assert.equal(ended.endedAt, "2026-08-05T09:00:00.000Z");
  assert.throws(
    () => switchActorCharacter(ended, secondUser),
    { name: "TypeError", message: /cannot switch after/ },
  );
  assert.throws(
    () => createActorSession({
      id: "session-invalid-time",
      storyWorld: staticWorld,
      userCharacter: firstUser,
      startedAt: "2026-08-05T09:00:00.000Z",
      endedAt: "2026-08-05T08:00:00.000Z",
    }),
    { name: "TypeError", message: /must not precede/ },
  );
});

test("rejects invalid character, world, and prompt references", () => {
  assert.throws(
    () => createCharacter({
      id: "invalid-role",
      displayName: "Invalid",
      role: "OTHER" as CharacterRole,
      storyWorldId: staticWorld.id,
      timezone: staticWorld.timezone,
    }),
    /character\.role/,
  );
  assert.throws(
    () => createCharacter({
      id: "invalid-prompt",
      displayName: "Invalid",
      role: CharacterRole.AI,
      storyWorldId: staticWorld.id,
      timezone: staticWorld.timezone,
      personaPromptRef: " ",
    }),
    /personaPromptRef/,
  );
  assert.throws(
    () => createStoryWorld({
      ...staticWorld,
      storyMode: "OTHER" as StoryMode,
    }),
    /storyMode/,
  );
});

test("validates relationship metric ranges and unsupported modes", () => {
  assert.throws(
    () => assertRelationshipState({ affinity: -101, trust: 0, conflict: 0, dependency: 0 }),
    { name: "RangeError", message: /affinity/ },
  );
  assert.throws(
    () => assertRelationshipState({ affinity: Number.NaN, trust: 0, conflict: 0, dependency: 0 }),
    { name: "TypeError", message: /finite number/ },
  );
  assert.throws(
    () => applyRelationshipDelta("OTHER" as StoryMode, {
      affinity: 0,
      trust: 0,
      conflict: 0,
      dependency: 0,
    }, {
      affinity: 0,
      trust: 0,
      conflict: 0,
      dependency: 0,
    }),
    { name: "TypeError", message: /Unsupported story mode/ },
  );
});
