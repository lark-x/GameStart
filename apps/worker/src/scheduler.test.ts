import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  EventRecurrenceKind,
  StoryMode,
  TriggerSource,
  createCharacter,
  createStoryWorld,
  createWorldEventDefinition,
} from "../../../packages/domain/src/index.ts";
import { createInMemoryRepositories } from "../../../packages/database/src/index.ts";
import { createEventScheduler, localDateTimeToUtc } from "./index.ts";

const world = createStoryWorld({
  id: "world-worker",
  name: "Worker Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const ai = createCharacter({
  id: "worker-ai",
  displayName: "Worker AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = new Date("2026-08-01T00:00:00.000Z");

test("converts ordinary local wall-clock time using the event timezone", () => {
  assert.equal(
    localDateTimeToUtc("2026-08-15T18:00:00", "Asia/Shanghai"),
    "2026-08-15T10:00:00.000Z",
  );
  assert.equal(
    localDateTimeToUtc("2026-08-15T18:00:00", "UTC"),
    "2026-08-15T18:00:00.000Z",
  );
});

test("materializes annual occurrences, skips disabled definitions, and is idempotent", async () => {
  const enabled = createWorldEventDefinition({
    id: "worker-annual",
    storyWorld: world,
    eventKey: "world:worker-festival",
    name: "Worker festival",
    triggerSource: TriggerSource.WORLD_HOLIDAY,
    recurrence: {
      kind: EventRecurrenceKind.ANNUAL,
      month: 8,
      day: 15,
      localTime: "18:00",
    },
    targetCharacters: [ai],
    createdAt: createdAt.toISOString(),
  });
  const disabled = createWorldEventDefinition({
    id: "worker-disabled",
    storyWorld: world,
    eventKey: "world:disabled",
    name: "Disabled event",
    triggerSource: TriggerSource.REAL_HOLIDAY,
    recurrence: {
      kind: EventRecurrenceKind.ANNUAL,
      month: 8,
      day: 16,
      localTime: "18:00",
    },
    enabled: false,
    createdAt: createdAt.toISOString(),
  });
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [ai],
    worldEventDefinitions: [enabled, disabled],
  });
  const scheduler = createEventScheduler(repositories, () => createdAt);
  const window = {
    from: "2026-08-14T00:00:00.000Z",
    to: "2026-08-17T00:00:00.000Z",
  };

  const first = await scheduler.materialize(world.id, window);
  assert.deepEqual(first.existing, []);
  assert.equal(first.inserted.length, 1);
  assert.equal(first.inserted[0]?.scheduledFor, "2026-08-15T10:00:00.000Z");
  const replay = await scheduler.materialize(world.id, window);
  assert.deepEqual(replay.inserted, []);
  assert.equal(replay.existing.length, 1);
  assert.equal(replay.existing[0]?.id, first.inserted[0]?.id);
});

test("materializes one-shot events only inside a half-open UTC window", async () => {
  const event = createWorldEventDefinition({
    id: "worker-once",
    storyWorld: world,
    eventKey: "story:worker-once",
    name: "One-shot scene",
    triggerSource: TriggerSource.STORY_NODE,
    recurrence: {
      kind: EventRecurrenceKind.ONCE,
      runAt: "2026-08-20T12:00:00.000Z",
    },
    createdAt: createdAt.toISOString(),
  });
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [ai],
    worldEventDefinitions: [event],
  });
  const scheduler = createEventScheduler(repositories, () => createdAt);
  const before = await scheduler.materialize(world.id, {
    from: "2026-08-20T12:00:00.000Z",
    to: "2026-08-20T12:00:00.000Z",
  }).catch((error: unknown) => error);
  assert.equal((before as Error).name, "RangeError");

  const result = await scheduler.materialize(world.id, {
    from: "2026-08-20T11:00:00.000Z",
    to: "2026-08-20T13:00:00.000Z",
  });
  assert.equal(result.inserted.length, 1);
  const outside = await scheduler.materialize(world.id, {
    from: "2026-08-20T13:00:00.000Z",
    to: "2026-08-20T14:00:00.000Z",
  });
  assert.deepEqual(outside.inserted, []);
  assert.deepEqual(outside.existing, []);
});

test("requires event repositories before starting a worker scheduler", () => {
  const incomplete = createInMemoryRepositories({ worlds: [world], characters: [ai] });
  const repositories = {
    storyWorlds: incomplete.storyWorlds,
    characters: incomplete.characters,
    relationshipEdges: incomplete.relationshipEdges,
    actorSessions: incomplete.actorSessions,
  };
  assert.throws(() => createEventScheduler(repositories), {
    name: "TypeError",
    message: /repositories are not configured/,
  });
});
