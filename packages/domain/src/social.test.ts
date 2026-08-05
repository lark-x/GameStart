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
  createMomentInteraction,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
  transitionMomentDraft,
} from "./index.ts";

const world = createStoryWorld({
  id: "world-social",
  name: "Social Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const author = createCharacter({
  id: "social-author",
  displayName: "Author",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const reader = createCharacter({
  id: "social-reader",
  displayName: "Reader",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T17:00:00.000Z";

function readyDraft() {
  const definition = createWorldEventDefinition({
    id: "social-event",
    storyWorld: world,
    eventKey: "world:social-event",
    name: "Social event",
    triggerSource: TriggerSource.WORLD_HOLIDAY,
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T10:00:00.000Z" },
    targetCharacters: [author],
    createdAt,
  });
  const occurrence = createScheduledOccurrence({
    id: "social-occurrence",
    definition,
    scheduledFor: "2026-08-06T10:00:00.000Z",
    occurrenceKey: "social:2026-08-06",
    createdAt,
  });
  const execution = createEventExecution({
    id: "social-execution",
    occurrence,
    definition,
    ruleVersion: "rules-v1",
    inputSnapshot: {},
    startedAt: "2026-08-06T10:00:01.000Z",
  });
  const action = createBehaviorAction({
    id: "social-action",
    execution,
    actorCharacterId: author.id,
    kind: ActionKind.CREATE_MOMENT,
    payload: { body: "A public moment." },
    createdAt,
  });
  const draft = createMomentDraft({
    id: "social-draft",
    action,
    visibility: MomentVisibility.PUBLIC,
    createdAt,
  });
  return transitionMomentDraft(draft, MomentDraftStatus.READY, createdAt);
}

test("publishes a READY draft and applies public visibility", () => {
  const moment = createMoment({
    id: "moment-social",
    draft: readyDraft(),
    publishedAt: "2026-08-06T10:05:00.000Z",
    imageMediaRef: "media://fake/moment.png",
  });
  assert.equal(moment.visibility, MomentVisibility.PUBLIC);
  assert.equal(moment.imageMediaRef, "media://fake/moment.png");
  assert.equal(moment.audienceCharacterIds.length, 0);
  assert.throws(
    () => createMoment({ id: "bad", draft: { ...readyDraft(), status: MomentDraftStatus.DRAFT }, publishedAt: createdAt }),
    { name: "TypeError", message: /READY draft/ },
  );
});

test("enforces comment/like payloads and actor world ownership", () => {
  const moment = createMoment({
    id: "moment-interactions",
    draft: readyDraft(),
    publishedAt: "2026-08-06T10:05:00.000Z",
  });
  const like = createMomentInteraction({
    id: "like-1",
    moment,
    actor: reader,
    kind: MomentInteractionKind.LIKE,
    createdAt,
    idempotencyKey: "like-key",
  });
  assert.equal(like.kind, MomentInteractionKind.LIKE);
  const comment = createMomentInteraction({
    id: "comment-1",
    moment,
    actor: reader,
    kind: MomentInteractionKind.COMMENT,
    text: "Beautiful!",
    createdAt,
    idempotencyKey: "comment-key",
  });
  assert.equal(comment.text, "Beautiful!");
  assert.throws(
    () => createMomentInteraction({
      id: "bad-like",
      moment,
      actor: reader,
      kind: MomentInteractionKind.LIKE,
      text: "not allowed",
      createdAt,
      idempotencyKey: "bad",
    }),
    { name: "TypeError", message: /LIKE interaction/ },
  );
});
