import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  MemoryKind,
  MemorySource,
  MemoryVisibility,
  StoryMode,
  createCharacter,
  createMemoryItem,
  createStoryWorld,
} from "@living-network/domain";
import { createInMemoryRepositories } from "./index.ts";

const world = createStoryWorld({
  id: "world-memory-db",
  name: "Memory DB Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const user = createCharacter({
  id: "memory-db-user",
  displayName: "User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const ai = createCharacter({
  id: "memory-db-ai",
  displayName: "AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T17:00:00.000Z";

const publicMemory = createMemoryItem({
  id: "memory-db-public",
  storyWorld: world,
  kind: MemoryKind.EVENT_FACT,
  visibility: MemoryVisibility.PUBLIC,
  source: MemorySource.SYSTEM_EVENT,
  content: "The lantern festival is tomorrow.",
  confidence: 1,
  createdAt,
});
const privateMemory = createMemoryItem({
  id: "memory-db-private",
  storyWorld: world,
  kind: MemoryKind.USER_PREFERENCE,
  visibility: MemoryVisibility.PRIVATE,
  source: MemorySource.USER_AUTHORED,
  content: "The user likes lanterns.",
  confidence: 0.8,
  createdAt,
  subjectCharacter: user,
});

test("lists only memories visible to the reader and ranks keyword matches", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [user, ai],
    memories: [publicMemory, privateMemory],
  });
  const memories = repositories.memories;
  assert.ok(memories);

  const visibleToUser = await memories.listForCharacter(world.id, user.id);
  const visibleToAi = await memories.listForCharacter(world.id, ai.id);
  assert.deepEqual(visibleToUser.map((item) => item.id).sort(), [
    privateMemory.id,
    publicMemory.id,
  ]);
  assert.deepEqual(visibleToAi.map((item) => item.id), [publicMemory.id]);

  const results = await memories.search({
    storyWorldId: world.id,
    readerCharacterId: ai.id,
    queryText: "lantern festival",
    limit: 5,
  });
  assert.equal(results[0]?.memory.id, publicMemory.id);
  assert.ok((results[0]?.score ?? 0) > 0);
});

test("rejects invalid memory search and duplicate saves", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [user, ai],
    memories: [publicMemory],
  });
  const memories = repositories.memories;
  assert.ok(memories);
  await assert.rejects(
    memories.search({
      storyWorldId: world.id,
      readerCharacterId: user.id,
      queryText: "",
    }),
    { name: "TypeError", message: /queryText/ },
  );
  await assert.rejects(
    memories.save(publicMemory),
    { name: "TypeError", message: /Duplicate memory id/ },
  );
});
