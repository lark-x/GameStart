import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  EventRecurrenceKind,
  ScheduledOccurrenceStatus,
  StoryMode,
  TriggerSource,
  annualOccurrenceKey,
  createCharacter,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
  transitionOccurrence,
} from "@living-network/domain";
import { createInMemoryRepositories } from "./index.ts";

const world = createStoryWorld({
  id: "world-event-db",
  name: "Event DB Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "event-db-character",
  displayName: "Aster",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T17:00:00.000Z";

function definition() {
  return createWorldEventDefinition({
    id: "event-db-festival",
    storyWorld: world,
    eventKey: "world:db-festival",
    name: "Database festival",
    triggerSource: TriggerSource.WORLD_HOLIDAY,
    recurrence: {
      kind: EventRecurrenceKind.ANNUAL,
      month: 8,
      day: 15,
      localTime: "18:00",
    },
    targetCharacters: [character],
    createdAt,
  });
}

test("stores event definitions and occurrences with defensive copies", async () => {
  const eventDefinition = definition();
  const occurrence = createScheduledOccurrence({
    id: "occurrence-db-festival",
    definition: eventDefinition,
    scheduledFor: "2026-08-15T10:00:00.000Z",
    occurrenceKey: annualOccurrenceKey(eventDefinition, 2026),
    createdAt,
  });
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [eventDefinition],
    scheduledOccurrences: [occurrence],
  });

  assert.deepEqual(await repositories.worldEventDefinitions?.getById(eventDefinition.id), eventDefinition);
  const storedOccurrence = await repositories.scheduledOccurrences?.getByOccurrenceKey(
    world.id,
    occurrence.occurrenceKey,
  );
  assert.deepEqual(storedOccurrence, occurrence);
  const definitions = await repositories.worldEventDefinitions?.listByStoryWorld(world.id);
  assert.ok(definitions);
  (definitions[0]?.targetCharacterIds as string[]).push("mutated");
  assert.deepEqual(
    (await repositories.worldEventDefinitions?.getById(eventDefinition.id))?.targetCharacterIds,
    [character.id],
  );
});

test("occurrence writes are idempotent and pending listing is bounded", async () => {
  const eventDefinition = definition();
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [character] });
  await repositories.worldEventDefinitions?.save(eventDefinition);
  const occurrence = createScheduledOccurrence({
    id: "occurrence-db-pending",
    definition: eventDefinition,
    scheduledFor: "2026-08-05T10:00:00.000Z",
    occurrenceKey: annualOccurrenceKey(eventDefinition, 2026),
    createdAt,
  });
  const first = await repositories.scheduledOccurrences?.save(occurrence);
  const replay = await repositories.scheduledOccurrences?.save({
    ...occurrence,
    id: "different-replay-id",
  });
  assert.equal(first?.inserted, true);
  assert.equal(replay?.inserted, false);
  assert.equal(replay?.occurrence.id, occurrence.id);
  const pending = await repositories.scheduledOccurrences?.listPending(
    world.id,
    "2026-08-06T00:00:00.000Z",
    1,
  );
  assert.deepEqual(pending?.map((item) => item.id), [occurrence.id]);

  const completed = transitionOccurrence(occurrence, ScheduledOccurrenceStatus.ENQUEUED);
  await repositories.scheduledOccurrences?.update(completed);
  assert.deepEqual(
    await repositories.scheduledOccurrences?.listPending(
      world.id,
      "2026-08-06T00:00:00.000Z",
      10,
    ),
    [],
  );
  assert.deepEqual(
    await repositories.scheduledOccurrences?.listByWindow(
      world.id,
      "2026-08-05T00:00:00.000Z",
      "2026-08-06T00:00:00.000Z",
      10,
    ),
    [completed],
  );
  await assert.rejects(
    repositories.scheduledOccurrences!.listByWindow(
      world.id,
      "2026-08-06T00:00:00.000Z",
      "2026-08-05T00:00:00.000Z",
      10,
    ),
    { name: "RangeError", message: /startsAt/ },
  );
});

test("rejects occurrence references that do not match a stored definition", async () => {
  const eventDefinition = definition();
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [character] });
  assert.ok(repositories.scheduledOccurrences);
  await assert.rejects(
    repositories.scheduledOccurrences.save({
      id: "occurrence-missing-definition",
      definitionId: eventDefinition.id,
      storyWorldId: world.id,
      eventKey: eventDefinition.eventKey,
      scheduledFor: createdAt,
      timezone: eventDefinition.timezone,
      occurrenceKey: "missing-definition:2026",
      status: ScheduledOccurrenceStatus.PENDING,
      createdAt,
    }),
    { name: "TypeError", message: /invalid event definition/ },
  );
});
