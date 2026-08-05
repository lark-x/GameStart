import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionKind,
  CharacterRole,
  EventRecurrenceKind,
  MomentDraftStatus,
  MomentInteractionKind,
  MomentVisibility,
  StoryMode,
  TriggerSource,
  createBehaviorAction,
  createCharacter,
  createEventExecution,
  createMoment,
  createMomentDraft,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
  transitionMomentDraft,
} from "../../../packages/domain/src/index.ts";
import { ApiApplication, createApiStore } from "./index.ts";

const world = createStoryWorld({
  id: "world-api-moments",
  name: "Moment API Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const author = createCharacter({
  id: "api-moment-author",
  displayName: "Author",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const reader = createCharacter({
  id: "api-moment-reader",
  displayName: "Reader",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const outsider = createCharacter({
  id: "api-moment-outsider",
  displayName: "Outsider",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T17:00:00.000Z";

function makeMoment(id: string, visibility: MomentVisibility, audience = [] as typeof reader[]) {
  const definition = createWorldEventDefinition({
    id: `${id}-definition`,
    storyWorld: world,
    eventKey: `${id}:event`,
    name: id,
    triggerSource: TriggerSource.MANUAL,
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T10:00:00.000Z" },
    targetCharacters: [author],
    createdAt,
  });
  const occurrence = createScheduledOccurrence({
    id: `${id}-occurrence`,
    definition,
    scheduledFor: "2026-08-06T10:00:00.000Z",
    occurrenceKey: `${id}:occurrence`,
    createdAt,
  });
  const execution = createEventExecution({
    id: `${id}-execution`,
    occurrence,
    definition,
    ruleVersion: "rules-v1",
    inputSnapshot: {},
    startedAt: "2026-08-06T10:00:01.000Z",
  });
  const action = createBehaviorAction({
    id: `${id}-action`,
    execution,
    actorCharacterId: author.id,
    kind: ActionKind.CREATE_MOMENT,
    payload: { body: `${id} body` },
    createdAt,
  });
  const draft = createMomentDraft({
    id: `${id}-draft`,
    action,
    visibility,
    createdAt,
  });
  const ready = transitionMomentDraft(draft, MomentDraftStatus.READY, createdAt);
  return createMoment({
    id,
    draft: ready,
    publishedAt: "2026-08-06T10:05:00.000Z",
    audienceCharacters: audience,
  });
}

function createApplication() {
  const publicMoment = makeMoment("moment-public-api", MomentVisibility.PUBLIC);
  const privateMoment = makeMoment("moment-private-api", MomentVisibility.PRIVATE, [author]);
  return {
    publicMoment,
    privateMoment,
    application: new ApiApplication(
      createApiStore({
        worlds: [world],
        characters: [author, reader, outsider],
        moments: [publicMoment, privateMoment],
      }),
    ),
  };
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

test("lists public moments and supports idempotent likes/comments", async () => {
  const { application, publicMoment } = createApplication();
  const feed = await application.handle(
    new Request(
      `http://localhost/v1/moments?storyWorldId=${world.id}&readerCharacterId=${reader.id}&limit=10`,
    ),
  );
  assert.equal(feed.status, 200);
  assert.deepEqual((await json(feed) as { data: unknown[] }).data.map((item: any) => item.id), [
    publicMoment.id,
  ]);

  const request = {
    id: "api-like-1",
    actorCharacterId: reader.id,
    kind: MomentInteractionKind.LIKE,
    createdAt,
    idempotencyKey: "api-like-key",
  };
  const first = await application.handle(
    new Request(`http://localhost/v1/moments/${publicMoment.id}/interactions`, {
      method: "POST",
      body: JSON.stringify(request),
    }),
  );
  assert.equal(first.status, 200);
  assert.equal((await json(first) as { data: { inserted: boolean } }).data.inserted, true);
  const replay = await application.handle(
    new Request(`http://localhost/v1/moments/${publicMoment.id}/interactions`, {
      method: "POST",
      body: JSON.stringify({ ...request, id: "different-id" }),
    }),
  );
  assert.equal(replay.status, 200);
  assert.equal((await json(replay) as { data: { inserted: boolean } }).data.inserted, false);

  const interactions = await application.handle(
    new Request(
      `http://localhost/v1/moments/${publicMoment.id}/interactions?readerCharacterId=${reader.id}`,
    ),
  );
  assert.equal(interactions.status, 200);
  assert.equal((await json(interactions) as { data: unknown[] }).data.length, 1);
});

test("protects private moments and validates interaction bodies", async () => {
  const { application, privateMoment } = createApplication();
  const hidden = await application.handle(
    new Request(
      `http://localhost/v1/moments?storyWorldId=${world.id}&readerCharacterId=${reader.id}`,
    ),
  );
  assert.equal(hidden.status, 200);
  assert.deepEqual((await json(hidden) as { data: unknown[] }).data.map((item: any) => item.id), [
    "moment-public-api",
  ]);
  const forbidden = await application.handle(
    new Request(
      `http://localhost/v1/moments/${privateMoment.id}/interactions?readerCharacterId=${reader.id}`,
    ),
  );
  assert.equal(forbidden.status, 403);
  const bad = await application.handle(
    new Request(`http://localhost/v1/moments/${privateMoment.id}/interactions`, {
      method: "POST",
      body: JSON.stringify({
        id: "bad-interaction",
        actorCharacterId: outsider.id,
        kind: "COMMENT",
        text: "hidden",
        createdAt,
        idempotencyKey: "bad-key",
      }),
    }),
  );
  assert.equal(bad.status, 403);
});
