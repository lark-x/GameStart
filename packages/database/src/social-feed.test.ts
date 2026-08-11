import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionKind,
  CharacterRole,
  EventRecurrenceKind,
  MomentInteractionKind,
  MomentVisibility,
  StoryMode,
  TriggerSource,
  createBehaviorAction,
  createCharacter,
  createEventExecution,
  createMoment,
  createMomentDraft,
  createMomentInteraction,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
  transitionMomentDraft,
  MomentDraftStatus,
} from "@living-network/domain";
import { createInMemoryRepositories } from "./index.ts";

const world = createStoryWorld({
  id: "world-social-db",
  name: "Social DB Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const author = createCharacter({
  id: "social-db-author",
  displayName: "Author",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const reader = createCharacter({
  id: "social-db-reader",
  displayName: "Reader",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T17:00:00.000Z";

function createFixture() {
  const definition = createWorldEventDefinition({
    id: "social-db-event",
    storyWorld: world,
    eventKey: "world:social-db",
    name: "Social DB event",
    triggerSource: TriggerSource.WORLD_HOLIDAY,
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T10:00:00.000Z" },
    targetCharacters: [author],
    createdAt,
  });
  const occurrence = createScheduledOccurrence({
    id: "social-db-occurrence",
    definition,
    scheduledFor: "2026-08-06T10:00:00.000Z",
    occurrenceKey: "social-db:2026-08-06",
    createdAt,
  });
  const execution = createEventExecution({
    id: "social-db-execution",
    occurrence,
    definition,
    ruleVersion: "rules-v1",
    inputSnapshot: {},
    startedAt: "2026-08-06T10:00:01.000Z",
  });
  const action = createBehaviorAction({
    id: "social-db-action",
    execution,
    actorCharacterId: author.id,
    kind: ActionKind.CREATE_MOMENT,
    payload: { body: "Public DB moment." },
    createdAt,
  });
  const draft = createMomentDraft({
    id: "social-db-draft",
    action,
    visibility: MomentVisibility.PUBLIC,
    createdAt,
  });
  const ready = transitionMomentDraft(draft, MomentDraftStatus.READY, createdAt);
  const moment = createMoment({
    id: "social-db-moment",
    draft: ready,
    publishedAt: "2026-08-06T10:05:00.000Z",
  });
  const like = createMomentInteraction({
    id: "social-db-like",
    moment,
    actor: reader,
    kind: MomentInteractionKind.LIKE,
    createdAt,
    idempotencyKey: "social-db-like-key",
  });
  return { definition, occurrence, execution, action, draft, moment, like };
}

test("lists visible feed moments and idempotently writes interactions", async () => {
  const fixture = createFixture();
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [author, reader],
    worldEventDefinitions: [fixture.definition],
    scheduledOccurrences: [fixture.occurrence],
    eventExecutions: [fixture.execution],
    behaviorActions: [fixture.action],
    momentDrafts: [fixture.draft],
    moments: [fixture.moment],
  });
  assert.deepEqual(
    await repositories.moments?.listFeed(world.id, reader.id, 10),
    [fixture.moment],
  );
  const first = await repositories.momentInteractions?.save(fixture.like);
  const replay = await repositories.momentInteractions?.save({
    ...fixture.like,
    id: "different-like-id",
  });
  assert.equal(first?.inserted, true);
  assert.equal(replay?.inserted, false);
  assert.equal(replay?.interaction.id, fixture.like.id);
  assert.deepEqual(
    await repositories.momentInteractions?.listByMoment(fixture.moment.id),
    [fixture.like],
  );
});

test("rejects conflicting interaction keys and duplicate likes", async () => {
  const fixture = createFixture();
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [author, reader],
    moments: [fixture.moment],
    momentInteractions: [fixture.like],
  });
  assert.ok(repositories.momentInteractions);
  await assert.rejects(
    repositories.momentInteractions.save({
      ...fixture.like,
      id: "conflict-like",
      kind: MomentInteractionKind.COMMENT,
      text: "conflict",
    }),
    { name: "TypeError", message: /idempotency key conflict/ },
  );
  await assert.rejects(
    repositories.momentInteractions.save({
      ...fixture.like,
      id: "second-like",
      idempotencyKey: "second-like-key",
    }),
    { name: "TypeError", message: /already liked/ },
  );
});
