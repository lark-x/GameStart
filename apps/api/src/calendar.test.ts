import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  EventRecurrenceKind,
  StoryMode,
  TriggerSource,
  annualOccurrenceKey,
  createCharacter,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
} from "../../../packages/domain/src/index.ts";
import { ApiApplication, createApiStore } from "./index.ts";

const world = createStoryWorld({
  id: "calendar-api-world",
  name: "Calendar API World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "calendar-api-character",
  displayName: "Calendar Character",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const definition = createWorldEventDefinition({
  id: "calendar-api-birthday",
  storyWorld: world,
  eventKey: "birthday:calendar-character",
  name: "Character birthday",
  triggerSource: TriggerSource.BIRTHDAY,
  recurrence: { kind: EventRecurrenceKind.ANNUAL, month: 8, day: 18, localTime: "09:00" },
  targetCharacters: [character],
  createdAt: "2026-08-05T19:00:00.000Z",
});
const occurrence = createScheduledOccurrence({
  id: "calendar-api-occurrence",
  definition,
  scheduledFor: "2026-08-18T01:00:00.000Z",
  occurrenceKey: annualOccurrenceKey(definition, 2026),
  createdAt: "2026-08-05T19:00:00.000Z",
});

function application() {
  return new ApiApplication(createApiStore({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
  }));
}

test("returns event definitions and occurrences inside a calendar window", async () => {
  const query = new URLSearchParams({
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-09-01T00:00:00.000Z",
  });
  const response = await application().handle(
    new Request(`http://localhost/v1/worlds/${world.id}/calendar?${query}`),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: {
      storyWorldId: world.id,
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z",
      definitions: [definition],
      occurrences: [occurrence],
    },
  });
});

test("bounds invalid calendar windows, missing worlds, and unsupported methods", async () => {
  const missingWindow = await application().handle(
    new Request(`http://localhost/v1/worlds/${world.id}/calendar`),
  );
  assert.equal(missingWindow.status, 400);
  const reversed = new URLSearchParams({
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: "2026-08-01T00:00:00.000Z",
  });
  assert.equal((await application().handle(
    new Request(`http://localhost/v1/worlds/${world.id}/calendar?${reversed}`),
  )).status, 400);
  const valid = new URLSearchParams({
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-09-01T00:00:00.000Z",
  });
  assert.equal((await application().handle(
    new Request(`http://localhost/v1/worlds/missing/calendar?${valid}`),
  )).status, 404);
  assert.equal((await application().handle(
    new Request(`http://localhost/v1/worlds/${world.id}/calendar?${valid}`, { method: "POST" }),
  )).status, 405);
});
