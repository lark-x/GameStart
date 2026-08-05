import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  MemoryKind,
  MemorySource,
  MemoryVisibility,
  StoryMode,
  assertMemoryItem,
  createCharacter,
  createMemoryItem,
  createStoryWorld,
  isMemoryVisibleTo,
  scoreMemory,
} from "./index.ts";

const world = createStoryWorld({
  id: "world-memory",
  name: "Memory Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const user = createCharacter({
  id: "memory-user",
  displayName: "User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const ai = createCharacter({
  id: "memory-ai",
  displayName: "AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T16:00:00.000Z";

test("creates memories with source, confidence, subject, and audience snapshots", () => {
  const memory = createMemoryItem({
    id: "memory-public",
    storyWorld: world,
    kind: MemoryKind.EVENT_FACT,
    visibility: MemoryVisibility.PUBLIC,
    source: MemorySource.SYSTEM_EVENT,
    content: "The summer festival opened.",
    confidence: 1,
    createdAt,
    occurredAt: createdAt,
    audienceCharacters: [user, ai],
    sourceRef: "event:summer-festival",
  });
  assert.deepEqual(memory.audienceCharacterIds, [user.id, ai.id]);
  assert.equal(memory.source, MemorySource.SYSTEM_EVENT);
  assert.equal(isMemoryVisibleTo(memory, "unrelated-character"), true);
});

test("enforces visibility audiences and confidence bounds", () => {
  const privateMemory = createMemoryItem({
    id: "memory-private",
    storyWorld: world,
    kind: MemoryKind.USER_PREFERENCE,
    visibility: MemoryVisibility.PRIVATE,
    source: MemorySource.USER_AUTHORED,
    content: "The user prefers quiet mornings.",
    confidence: 0.8,
    createdAt,
    subjectCharacter: user,
  });
  const relationMemory = createMemoryItem({
    id: "memory-relation",
    storyWorld: world,
    kind: MemoryKind.CHARACTER_IMPRESSION,
    visibility: MemoryVisibility.RELATION,
    source: MemorySource.LLM_DERIVED,
    content: "The user trusts the AI.",
    confidence: 0.6,
    createdAt,
    audienceCharacters: [user, ai],
  });
  const systemMemory = createMemoryItem({
    id: "memory-system",
    storyWorld: world,
    kind: MemoryKind.EVENT_FACT,
    visibility: MemoryVisibility.SYSTEM,
    source: MemorySource.LLM_DERIVED,
    content: "Candidate fact awaiting review.",
    confidence: 0.2,
    createdAt,
  });

  assert.equal(isMemoryVisibleTo(privateMemory, user.id), true);
  assert.equal(isMemoryVisibleTo(privateMemory, ai.id), false);
  assert.equal(isMemoryVisibleTo(relationMemory, ai.id), true);
  assert.equal(isMemoryVisibleTo(systemMemory, user.id), false);
  assert.throws(
    () => createMemoryItem({
      id: "bad-confidence",
      storyWorld: world,
      kind: MemoryKind.EVENT_FACT,
      visibility: MemoryVisibility.PUBLIC,
      source: MemorySource.IMPORTED,
      content: "bad",
      confidence: 1.1,
      createdAt,
    }),
    { name: "RangeError", message: /confidence/ },
  );
  assert.throws(
    () => createMemoryItem({
      id: "private-without-subject",
      storyWorld: world,
      kind: MemoryKind.EVENT_FACT,
      visibility: MemoryVisibility.PRIVATE,
      source: MemorySource.SYSTEM_EVENT,
      content: "bad",
      confidence: 0.5,
      createdAt,
    }),
    { name: "TypeError", message: /subjectCharacter/ },
  );
});

test("scores token overlap and confidence deterministically", () => {
  const memory = createMemoryItem({
    id: "memory-score",
    storyWorld: world,
    kind: MemoryKind.EVENT_FACT,
    visibility: MemoryVisibility.PUBLIC,
    source: MemorySource.SYSTEM_EVENT,
    content: "Autumn festival lantern ceremony",
    confidence: 0.8,
    createdAt,
  });
  assert.equal(scoreMemory(memory, "lantern ceremony"), 1.2);
  assert.equal(scoreMemory(memory, "winter"), 0);
  assert.equal(scoreMemory(memory, "   "), 0);
  assert.throws(() => assertMemoryItem({ ...memory, audienceCharacterIds: [user.id, user.id] }), {
    name: "TypeError",
    message: /duplicate character/,
  });
  assert.throws(() => createMemoryItem({
    id: "relation-without-audience",
    storyWorld: world,
    kind: MemoryKind.EVENT_FACT,
    visibility: MemoryVisibility.RELATION,
    source: MemorySource.SYSTEM_EVENT,
    content: "missing audience",
    confidence: 0.5,
    createdAt,
  }), { name: "TypeError", message: /requires audienceCharacters/ });
  assert.throws(() => createMemoryItem({
    id: "system-with-audience",
    storyWorld: world,
    kind: MemoryKind.EVENT_FACT,
    visibility: MemoryVisibility.SYSTEM,
    source: MemorySource.SYSTEM_EVENT,
    content: "invalid audience",
    confidence: 0.5,
    createdAt,
    audienceCharacters: [user],
  }), { name: "TypeError", message: /SYSTEM memory/ });
});

test("rejects memory references that belong to another world", () => {
  const other = createCharacter({
    id: "memory-outsider",
    displayName: "Outsider",
    role: CharacterRole.AI,
    storyWorldId: "other-memory-world",
    timezone: "UTC",
  });
  assert.throws(() => createMemoryItem({
    id: "subject-outsider",
    storyWorld: world,
    kind: MemoryKind.EVENT_FACT,
    visibility: MemoryVisibility.PRIVATE,
    source: MemorySource.SYSTEM_EVENT,
    content: "invalid subject",
    confidence: 0.5,
    createdAt,
    subjectCharacter: other,
  }), { name: "TypeError", message: /subjectCharacter/ });
  assert.throws(() => createMemoryItem({
    id: "audience-outsider",
    storyWorld: world,
    kind: MemoryKind.EVENT_FACT,
    visibility: MemoryVisibility.GROUP,
    source: MemorySource.SYSTEM_EVENT,
    content: "invalid audience",
    confidence: 0.5,
    createdAt,
    audienceCharacters: [other],
  }), { name: "TypeError", message: /audienceCharacters/ });
  const valid = createMemoryItem({
    id: "memory-assert-boundary",
    storyWorld: world,
    kind: MemoryKind.EVENT_FACT,
    visibility: MemoryVisibility.PUBLIC,
    source: MemorySource.SYSTEM_EVENT,
    content: "valid",
    confidence: 0.5,
    createdAt,
  });
  assert.throws(() => assertMemoryItem({ ...valid, confidence: 2 }), /confidence/);
  const { subjectCharacterId: _subjectCharacterId, ...withoutSubject } = valid;
  assert.throws(() => assertMemoryItem({ ...withoutSubject, visibility: MemoryVisibility.PRIVATE }), /subjectCharacterId/);
  assert.throws(() => assertMemoryItem({ ...valid, visibility: MemoryVisibility.RELATION, audienceCharacterIds: [] }), /audienceCharacterIds/);
  assert.throws(() => assertMemoryItem({ ...valid, visibility: MemoryVisibility.SYSTEM, audienceCharacterIds: [user.id] }), /SYSTEM memory/);
});
