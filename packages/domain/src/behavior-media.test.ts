import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionKind,
  ActionStatus,
  EventExecutionStatus,
  EventRecurrenceKind,
  ImageJobStatus,
  MomentDraftStatus,
  MomentVisibility,
  StoryMode,
  TriggerSource,
  attachMomentImageJob,
  assertBehaviorAction,
  assertImageJob,
  completeImageJob,
  createBehaviorAction,
  createEventExecution,
  createImageJob,
  createMomentDraft,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
  failImageJob,
  retryImageJob,
  submitImageJob,
  transitionBehaviorAction,
  transitionMomentDraft,
  CharacterRole,
  createCharacter,
} from "./index.ts";

const world = createStoryWorld({
  id: "world-behavior-media",
  name: "Behavior Media Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "behavior-character",
  displayName: "Aster",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T17:00:00.000Z";
const definition = createWorldEventDefinition({
  id: "behavior-event",
  storyWorld: world,
  eventKey: "world:behavior-event",
  name: "Behavior event",
  triggerSource: TriggerSource.WORLD_HOLIDAY,
  recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T10:00:00.000Z" },
  targetCharacters: [character],
  createdAt,
});
const occurrence = createScheduledOccurrence({
  id: "behavior-occurrence",
  definition,
  scheduledFor: "2026-08-06T10:00:00.000Z",
  occurrenceKey: "behavior-event:2026-08-06",
  createdAt,
});
const execution = createEventExecution({
  id: "behavior-execution",
  occurrence,
  definition,
  ruleVersion: "rules-v1",
  inputSnapshot: {},
  startedAt: "2026-08-06T10:00:01.000Z",
});

test("creates structured moment actions and enforces actor target and payload rules", () => {
  const action = createBehaviorAction({
    id: "action-moment",
    execution,
    actorCharacterId: character.id,
    kind: ActionKind.CREATE_MOMENT,
    payload: {
      body: "The lanterns are ready.",
      imagePrompt: "anime character under lanterns",
      workflowVersion: "wf-v1",
      seed: 42,
    },
    priority: 5,
    createdAt,
  });
  assert.equal(action.status, ActionStatus.PROPOSED);
  const accepted = transitionBehaviorAction(action, ActionStatus.ACCEPTED);
  assert.equal(accepted.status, ActionStatus.ACCEPTED);
  assert.throws(
    () => createBehaviorAction({
      id: "action-bad",
      execution,
      actorCharacterId: "outsider",
      kind: ActionKind.SEND_MESSAGE,
      payload: { text: "bad" },
      createdAt,
    }),
    { name: "TypeError", message: /execution target/ },
  );
  assert.throws(
    () => createBehaviorAction({
      id: "action-image-bad",
      execution,
      actorCharacterId: character.id,
      kind: ActionKind.REQUEST_IMAGE,
      payload: { prompt: "missing workflow" },
      createdAt,
    }),
    { name: "TypeError", message: /workflowVersion/ },
  );
});

test("creates moment drafts, attaches image jobs, and enforces publication transitions", () => {
  const action = createBehaviorAction({
    id: "action-moment-publish",
    execution,
    actorCharacterId: character.id,
    kind: ActionKind.CREATE_MOMENT,
    payload: {
      body: "The lanterns are ready.",
      imagePrompt: "anime character under lanterns",
      workflowVersion: "wf-v1",
    },
    createdAt,
  });
  const draft = createMomentDraft({
    id: "moment-draft",
    action,
    visibility: MomentVisibility.PUBLIC,
    createdAt,
  });
  const job = createImageJob({ id: "image-job", action, momentDraftId: draft.id, createdAt });
  const attached = attachMomentImageJob(draft, job.id, createdAt);
  assert.equal(attached.imageJobId, job.id);
  const ready = transitionMomentDraft(attached, MomentDraftStatus.READY, createdAt);
  const published = transitionMomentDraft(ready, MomentDraftStatus.PUBLISHED, createdAt);
  assert.equal(published.status, MomentDraftStatus.PUBLISHED);
  assert.throws(
    () => transitionMomentDraft(published, MomentDraftStatus.DRAFT, createdAt),
    { message: /cannot transition moment/ },
  );
});

test("keeps image job lifecycle explicit for Fake ComfyUI adapters", () => {
  const action = createBehaviorAction({
    id: "action-image",
    execution,
    actorCharacterId: character.id,
    kind: ActionKind.REQUEST_IMAGE,
    payload: {
      prompt: "anime lantern festival",
      workflowVersion: "wf-v1",
      negativePrompt: "blurry",
      seed: 7,
    },
    createdAt,
  });
  const job = createImageJob({ id: "image-job-lifecycle", action, createdAt });
  assert.equal(job.status, ImageJobStatus.QUEUED);
  const submitted = submitImageJob(job, "fake-comfy-job-1", createdAt);
  const succeeded = completeImageJob(submitted, "media://fake-comfy-job-1.png", createdAt);
  assert.equal(succeeded.status, ImageJobStatus.SUCCEEDED);
  assert.equal(succeeded.mediaRef, "media://fake-comfy-job-1.png");
  assert.throws(() => submitImageJob(succeeded, "another-job", createdAt), /cannot submit/);
  assert.throws(() => completeImageJob(job, "media://not-ready.png", createdAt), /cannot complete/);
  assert.throws(() => failImageJob(succeeded, "too late", createdAt), /cannot fail/);
  const failed = failImageJob(job, "Fake ComfyUI offline", createdAt);
  assert.equal(failed.status, ImageJobStatus.FAILED);
  assert.equal(execution.status, EventExecutionStatus.RUNNING);
  const retry = retryImageJob(failed, createdAt, 3);
  assert.equal(retry.status, ImageJobStatus.QUEUED);
  assert.equal(retry.attempt, 2);
  const failedAgain = failImageJob(retry, "still offline", createdAt);
  const retryAgain = retryImageJob(failedAgain, createdAt, 3);
  assert.equal(retryAgain.attempt, 3);
  const failedThird = failImageJob(retryAgain, "final failure", createdAt);
  assert.throws(
    () => retryImageJob(failedThird, createdAt, 3),
    { name: "RangeError", message: /maximum retry/ },
  );
});

test("covers behavior/media validation branches and terminal guards", () => {
  assert.throws(() => createBehaviorAction({
    id: "invalid-seed-action",
    execution,
    actorCharacterId: character.id,
    kind: ActionKind.REQUEST_IMAGE,
    payload: { prompt: "image", workflowVersion: "wf-v1", seed: -1 },
    createdAt,
  }), /non-negative integer/);
  const action = createBehaviorAction({
    id: "edge-action",
    execution,
    actorCharacterId: character.id,
    kind: ActionKind.SEND_MESSAGE,
    payload: { text: "hello" },
    createdAt,
  });
  assert.throws(() => createBehaviorAction({
    id: "invalid-priority",
    execution,
    actorCharacterId: character.id,
    kind: ActionKind.SEND_MESSAGE,
    payload: { text: "hello" },
    priority: -1,
    createdAt,
  }), /priority/);
  const accepted = transitionBehaviorAction(action, ActionStatus.ACCEPTED);
  assert.deepEqual(transitionBehaviorAction(accepted, ActionStatus.ACCEPTED), accepted);
  assert.throws(() => transitionBehaviorAction(accepted, ActionStatus.REJECTED), /cannot transition action/);
  assert.throws(() => assertBehaviorAction({ ...action, priority: -1 }), /priority/);
  assert.throws(() => createMomentDraft({ id: "wrong-draft", action, visibility: MomentVisibility.PUBLIC, createdAt }), /CREATE_MOMENT/);
  const momentAction = createBehaviorAction({
    id: "edge-moment-action",
    execution,
    actorCharacterId: character.id,
    kind: ActionKind.CREATE_MOMENT,
    payload: { body: "body", imagePrompt: "prompt", workflowVersion: "wf-v1" },
    createdAt,
  });
  const draft = createMomentDraft({ id: "edge-draft", action: momentAction, visibility: MomentVisibility.PUBLIC, createdAt });
  const rejected = transitionMomentDraft(draft, MomentDraftStatus.REJECTED, createdAt);
  assert.throws(() => attachMomentImageJob(rejected, "image", createdAt), /cannot attach/);
  const published = { ...draft, status: MomentDraftStatus.PUBLISHED };
  assert.doesNotThrow(() => {
    // A published text-only moment intentionally has no image job.
    transitionMomentDraft(published, MomentDraftStatus.PUBLISHED, createdAt);
  });
  assert.throws(() => createImageJob({ id: "wrong-kind", action, createdAt }), /REQUEST_IMAGE or CREATE_MOMENT/);
  const job = createImageJob({ id: "edge-job", action: momentAction, createdAt });
  assert.throws(() => assertImageJob({ ...job, attempt: 0 }), /attempt/);
  assert.throws(() => assertImageJob({ ...job, seed: -1 }), /seed/);
  assert.throws(() => assertImageJob({ ...job, status: ImageJobStatus.QUEUED, externalJobId: "external" }), /QUEUED/);
  assert.throws(() => assertImageJob({ ...job, status: ImageJobStatus.SUBMITTED }), /SUBMITTED/);
  assert.throws(() => assertImageJob({ ...job, status: ImageJobStatus.SUCCEEDED, externalJobId: "external" }), /SUCCEEDED/);
  assert.throws(() => assertImageJob({ ...job, status: ImageJobStatus.FAILED }), /FAILED/);
  assert.throws(() => retryImageJob(job, createdAt, 0), /maxAttempts/);
  assert.throws(() => retryImageJob(job, createdAt), /cannot retry/);
});
