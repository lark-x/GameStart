import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  EventRecurrenceKind,
  ScheduledOccurrenceStatus,
  StoryMode,
  TriggerSource,
  annualOccurrenceKey,
  assertWorldEventDefinition,
  createCharacter,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
  transitionOccurrence,
} from "./index.ts";

const world = createStoryWorld({
  id: "world-events",
  name: "Event Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "event-character",
  displayName: "Aster",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
  birthDate: "2000-02-29",
});
const createdAt = "2026-08-05T16:00:00.000Z";

test("creates annual birthday/holiday definitions with a stable annual key", () => {
  const definition = createWorldEventDefinition({
    id: "event-aster-birthday",
    storyWorld: world,
    eventKey: "character:aster:birthday",
    name: "Aster's birthday",
    triggerSource: TriggerSource.BIRTHDAY,
    recurrence: {
      kind: EventRecurrenceKind.ANNUAL,
      month: 2,
      day: 29,
      localTime: "09:30",
    },
    targetCharacters: [character],
    priority: 20,
    cooldownSeconds: 86_400,
    createdAt,
  });

  assert.equal(definition.timezone, world.timezone);
  assert.deepEqual(definition.targetCharacterIds, [character.id]);
  assert.equal(annualOccurrenceKey(definition, 2028), "event-aster-birthday:2028-02-29");
  assert.equal(definition.enabled, true);
});

test("keeps one-shot events disabled without coupling scheduling to story mode", () => {
  const definition = createWorldEventDefinition({
    id: "event-final-scene",
    storyWorld: world,
    eventKey: "story:final-scene",
    name: "Final scene",
    triggerSource: TriggerSource.STORY_NODE,
    recurrence: {
      kind: EventRecurrenceKind.ONCE,
      runAt: "2026-12-31T12:00:00.000Z",
    },
    enabled: false,
    createdAt,
  });

  assert.equal(definition.recurrence.kind, EventRecurrenceKind.ONCE);
  assert.equal(definition.enabled, false);
  assert.throws(() => annualOccurrenceKey(definition, 2026), {
    name: "TypeError",
    message: /annual event definition/,
  });
});

test("rejects invalid calendar data and cross-world targets", () => {
  const otherWorld = createStoryWorld({
    id: "world-other-events",
    name: "Other Event Story",
    timezone: "UTC",
    storyMode: StoryMode.DYNAMIC,
    relationshipDynamicsEnabled: true,
  });
  const outsider = createCharacter({
    id: "event-outsider",
    displayName: "Outsider",
    role: CharacterRole.AI,
    storyWorldId: otherWorld.id,
    timezone: otherWorld.timezone,
  });

  assert.throws(
    () => createWorldEventDefinition({
      id: "bad-date",
      storyWorld: world,
      eventKey: "holiday:bad",
      name: "Bad date",
      triggerSource: TriggerSource.REAL_HOLIDAY,
      recurrence: {
        kind: EventRecurrenceKind.ANNUAL,
        month: 2,
        day: 30,
        localTime: "09:00",
      },
      createdAt,
    }),
    { name: "RangeError", message: /valid calendar date/ },
  );
  assert.throws(
    () => createWorldEventDefinition({
      id: "bad-target",
      storyWorld: world,
      eventKey: "holiday:outsider",
      name: "Bad target",
      triggerSource: TriggerSource.WORLD_HOLIDAY,
      recurrence: {
        kind: EventRecurrenceKind.ONCE,
        runAt: "2026-10-01T00:00:00.000Z",
      },
      targetCharacters: [outsider],
      createdAt,
    }),
    { name: "TypeError", message: /belong to storyWorld/ },
  );
});

test("creates occurrences with copied event identity and enforces lifecycle transitions", () => {
  const definition = createWorldEventDefinition({
    id: "event-annual-festival",
    storyWorld: world,
    eventKey: "world:summer-festival",
    name: "Summer festival",
    triggerSource: TriggerSource.WORLD_HOLIDAY,
    recurrence: {
      kind: EventRecurrenceKind.ANNUAL,
      month: 8,
      day: 15,
      localTime: "18:00",
    },
    createdAt,
  });
  const occurrence = createScheduledOccurrence({
    id: "occurrence-2026-festival",
    definition,
    scheduledFor: "2026-08-15T10:00:00.000Z",
    occurrenceKey: annualOccurrenceKey(definition, 2026),
    createdAt,
  });

  assert.equal(occurrence.status, ScheduledOccurrenceStatus.PENDING);
  const enqueued = transitionOccurrence(occurrence, ScheduledOccurrenceStatus.ENQUEUED);
  const running = transitionOccurrence(enqueued, ScheduledOccurrenceStatus.RUNNING);
  const completed = transitionOccurrence(running, ScheduledOccurrenceStatus.COMPLETED);
  assert.equal(completed.eventKey, definition.eventKey);
  assert.equal(completed.timezone, definition.timezone);
  assert.equal(occurrence.status, ScheduledOccurrenceStatus.PENDING);
  assert.throws(
    () => transitionOccurrence(completed, ScheduledOccurrenceStatus.ENQUEUED),
    { message: /cannot transition occurrence/ },
  );
  assert.equal(
    transitionOccurrence(running, ScheduledOccurrenceStatus.CANCELLED).status,
    ScheduledOccurrenceStatus.CANCELLED,
  );
});

test("supports retrying failed occurrences and rejects malformed local times", () => {
  const definition = createWorldEventDefinition({
    id: "event-retry",
    storyWorld: world,
    eventKey: "manual:retry",
    name: "Retryable event",
    triggerSource: TriggerSource.MANUAL,
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: createdAt },
    createdAt,
  });
  const occurrence = createScheduledOccurrence({
    id: "occurrence-retry",
    definition,
    scheduledFor: createdAt,
    occurrenceKey: "manual:retry:2026-08-05T16:00:00.000Z",
    createdAt,
  });
  const failed = transitionOccurrence(
    transitionOccurrence(occurrence, ScheduledOccurrenceStatus.ENQUEUED),
    ScheduledOccurrenceStatus.FAILED,
  );
  assert.equal(transitionOccurrence(failed, ScheduledOccurrenceStatus.ENQUEUED).status, "ENQUEUED");

  assert.throws(
    () => createWorldEventDefinition({
      id: "bad-time",
      storyWorld: world,
      eventKey: "holiday:bad-time",
      name: "Bad time",
      triggerSource: TriggerSource.REAL_HOLIDAY,
      recurrence: {
        kind: EventRecurrenceKind.ANNUAL,
        month: 5,
        day: 1,
        localTime: "9:00",
      },
      createdAt,
    }),
    { name: "TypeError", message: /HH:mm/ },
  );
});

test("covers recurrence, priority, definition, and annual-key validation boundaries", () => {
  const base = {
    id: "event-boundary",
    storyWorld: world,
    eventKey: "manual:boundary",
    name: "Boundary event",
    triggerSource: TriggerSource.MANUAL,
    recurrence: { kind: EventRecurrenceKind.ANNUAL, month: 1, day: 1, localTime: "00:00" } as const,
    createdAt,
  };

  for (const recurrence of [
    { ...base.recurrence, month: 0 },
    { ...base.recurrence, day: 0 },
  ]) {
    assert.throws(
      () => createWorldEventDefinition({ ...base, recurrence }),
      { name: "RangeError", message: /between/ },
    );
  }
  assert.throws(
    () => createWorldEventDefinition({ ...base, recurrence: null as never }),
    { name: "TypeError", message: /event recurrence/ },
  );
  assert.throws(
    () => createWorldEventDefinition({ ...base, priority: -1 }),
    { name: "RangeError", message: /priority/ },
  );
  assert.throws(
    () => createWorldEventDefinition({ ...base, cooldownSeconds: -1 }),
    { name: "RangeError", message: /cooldownSeconds/ },
  );

  const definition = createWorldEventDefinition(base);
  assert.throws(
    () => assertWorldEventDefinition({ ...definition, priority: -1 }),
    { name: "RangeError", message: /priority/ },
  );
  assert.throws(
    () => assertWorldEventDefinition({ ...definition, cooldownSeconds: -1 }),
    { name: "RangeError", message: /cooldownSeconds/ },
  );
  assert.throws(
    () => assertWorldEventDefinition({ ...definition, enabled: "yes" as never }),
    { name: "TypeError", message: /enabled/ },
  );
  assert.throws(() => annualOccurrenceKey(definition, 0), { name: "RangeError", message: /year/ });
  assert.throws(() => annualOccurrenceKey(definition, 10_000), { name: "RangeError", message: /year/ });
});
