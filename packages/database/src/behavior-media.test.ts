import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionKind,
  CharacterRole,
  EventRecurrenceKind,
  StoryMode,
  TriggerSource,
  createBehaviorAction,
  createCharacter,
  createEventExecution,
  createImageJob,
  createMomentDraft,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
} from "../../domain/src/index.ts";
import { createInMemoryRepositories } from "./index.ts";

const world = createStoryWorld({
  id: "world-media-db",
  name: "Media DB Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "media-db-character",
  displayName: "Aster",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T17:00:00.000Z";
const definition = createWorldEventDefinition({
  id: "media-db-event",
  storyWorld: world,
  eventKey: "world:media-db",
  name: "Media DB event",
  triggerSource: TriggerSource.WORLD_HOLIDAY,
  recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T10:00:00.000Z" },
  targetCharacters: [character],
  createdAt,
});

const occurrence = createScheduledOccurrence({
  id: "media-db-occurrence",
  definition,
  scheduledFor: "2026-08-06T10:00:00.000Z",
  occurrenceKey: "media-db:2026-08-06",
  createdAt,
});
const execution = createEventExecution({
  id: "media-db-execution",
  occurrence,
  definition,
  ruleVersion: "rules-v1",
  inputSnapshot: {},
  startedAt: "2026-08-06T10:00:01.000Z",
});
const action = createBehaviorAction({
  id: "media-db-action",
  execution,
  actorCharacterId: character.id,
  kind: ActionKind.CREATE_MOMENT,
  payload: {
    body: "A media draft.",
    imagePrompt: "anime lanterns",
    workflowVersion: "wf-v1",
  },
  createdAt,
});
const draft = createMomentDraft({
  id: "media-db-draft",
  action,
  visibility: "PUBLIC",
  createdAt,
});
const imageJob = createImageJob({
  id: "media-db-image-job",
  action,
  momentDraftId: draft.id,
  createdAt,
});

test("stores behavior actions, moment drafts, and image jobs with defensive copies", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    eventExecutions: [execution],
    behaviorActions: [action],
    momentDrafts: [draft],
    imageJobs: [imageJob],
  });
  assert.deepEqual(await repositories.behaviorActions?.getById(action.id), action);
  assert.deepEqual(await repositories.momentDrafts?.getByActionId(action.id), draft);
  assert.deepEqual(await repositories.imageJobs?.getByActionId(action.id), imageJob);
  assert.ok(repositories.imageJobs);
  assert.deepEqual((await repositories.imageJobs.listQueued()).map((job) => job.id), [imageJob.id]);
  assert.deepEqual(await repositories.imageJobs.listSubmitted(), []);
  const actions = await repositories.behaviorActions?.listByExecution(execution.id);
  assert.ok(actions);
  (actions[0]?.payload as { body: string }).body = "mutated";
  assert.equal((await repositories.behaviorActions?.getById(action.id))?.payload.body, "A media draft.");
});

test("rejects duplicate action-linked drafts and image jobs", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    eventExecutions: [execution],
    behaviorActions: [action],
    momentDrafts: [draft],
    imageJobs: [imageJob],
  });
  assert.ok(repositories.momentDrafts);
  assert.ok(repositories.imageJobs);
  await assert.rejects(
    repositories.momentDrafts.save({ ...draft, id: "different-draft" }),
    { name: "TypeError", message: /Duplicate moment draft action/ },
  );
  await assert.rejects(
    repositories.imageJobs.save({ ...imageJob, id: "different-job" }),
    { name: "TypeError", message: /Duplicate image job action/ },
  );
});
