import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  StoryMode,
  createActorSession,
  createCharacter,
  createRelationshipEdge,
  createStoryWorld,
} from "../../domain/src/index.ts";
import { createInMemoryRepositories } from "./index.ts";

const world = createStoryWorld({
  id: "world-db",
  name: "Database Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const user = createCharacter({
  id: "user-db",
  displayName: "User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const ai = createCharacter({
  id: "ai-db",
  displayName: "AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const edge = createRelationshipEdge({
  id: "edge-db",
  source: user,
  target: ai,
  storyWorld: world,
  relationshipType: "friend",
  initialState: { affinity: 10, trust: 20, conflict: 0, dependency: -5 },
  isPublic: true,
  isBidirectional: true,
});
const session = createActorSession({
  id: "session-db",
  storyWorld: world,
  userCharacter: user,
  startedAt: "2026-08-05T10:00:00.000Z",
});

test("lists repository records asynchronously and returns defensive copies", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [user, ai],
    relationshipEdges: [edge],
    actorSessions: [session],
  });

  const worlds = await repositories.storyWorlds.list();
  const characters = await repositories.characters.listByStoryWorld(world.id);
  const edges = await repositories.relationshipEdges.listByStoryWorld(world.id);
  const storedSession = await repositories.actorSessions.getById(session.id);

  assert.deepEqual(worlds, [world]);
  assert.deepEqual(characters, [user, ai]);
  assert.deepEqual(edges, [edge]);
  assert.deepEqual(storedSession, session);

  (worlds[0] as { name: string }).name = "mutated";
  (edges[0] as { initialState: { affinity: number } }).initialState.affinity = 99;
  assert.equal((await repositories.storyWorlds.getById(world.id))?.name, world.name);
  assert.equal(
    (await repositories.relationshipEdges.getById(edge.id))?.initialState.affinity,
    edge.initialState.affinity,
  );
});

test("updates sessions and relationship edges only after reference validation", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [user, ai],
  });
  await repositories.actorSessions.save(session);
  await repositories.relationshipEdges.save(edge);

  const savedSession = await repositories.actorSessions.getById(session.id);
  const savedEdge = await repositories.relationshipEdges.getById(edge.id);
  assert.deepEqual(savedSession, session);
  assert.deepEqual(savedEdge, edge);

  await assert.rejects(
    repositories.actorSessions.save({ ...session, userCharacterId: ai.id }),
    { name: "TypeError", message: /invalid user character/ },
  );
  await assert.rejects(
    repositories.relationshipEdges.save({ ...edge, storyWorldId: "missing-world" }),
    { name: "TypeError", message: /unknown entity/ },
  );
});

test("rejects duplicate IDs and invalid seed references", () => {
  assert.throws(
    () => createInMemoryRepositories({ worlds: [world, world] }),
    { name: "TypeError", message: /Duplicate storyWorld id/ },
  );
  assert.throws(
    () =>
      createInMemoryRepositories({
        worlds: [world],
        characters: [{ ...user, storyWorldId: "missing-world" }],
      }),
    { name: "TypeError", message: /unknown story world/ },
  );
  assert.throws(
    () =>
      createInMemoryRepositories({
        worlds: [world],
        characters: [ai],
        actorSessions: [{ ...session, userCharacterId: ai.id }],
      }),
    { name: "TypeError", message: /invalid user character/ },
  );
});
