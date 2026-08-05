import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionKind,
  CharacterRole,
  EventRecurrenceKind,
  ImageJobStatus,
  MomentDraftStatus,
  StoryMode,
  TriggerSource,
  completeImageJob,
  createBehaviorAction,
  createCharacter,
  createEventExecution,
  createImageJob,
  createMomentDraft,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
  transitionMomentDraft,
} from "../../../packages/domain/src/index.ts";
import { createInMemoryRepositories } from "../../../packages/database/src/index.ts";
import { MomentPublicationCoordinator } from "./index.ts";

const world = createStoryWorld({
  id: "publication-world",
  name: "Publication World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const author = createCharacter({
  id: "publication-author",
  displayName: "Ari",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const reader = createCharacter({
  id: "publication-reader",
  displayName: "Bea",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T15:00:00.000Z";
const definition = createWorldEventDefinition({
  id: "publication-definition",
  storyWorld: world,
  eventKey: "publication:event",
  name: "Publication event",
  triggerSource: TriggerSource.MANUAL,
  recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T10:00:00.000Z" },
  targetCharacters: [author],
  createdAt,
});
const occurrence = createScheduledOccurrence({
  id: "publication-occurrence",
  definition,
  scheduledFor: "2026-08-06T10:00:00.000Z",
  occurrenceKey: "publication:once",
  createdAt,
});
const execution = createEventExecution({
  id: "publication-execution",
  occurrence,
  definition,
  ruleVersion: "rules-v1",
  inputSnapshot: {},
  startedAt: "2026-08-06T10:00:01.000Z",
});
const action = createBehaviorAction({
  id: "publication-action",
  execution,
  actorCharacterId: author.id,
  kind: ActionKind.CREATE_MOMENT,
  payload: {
    body: "A finished observatory note.",
    imagePrompt: "night sky",
    workflowVersion: "moment@v1",
  },
  createdAt,
});
const draft = createMomentDraft({
  id: "publication-draft",
  action,
  visibility: "GROUP",
  createdAt,
});
const imageJob = createImageJob({ id: "publication-image", action, momentDraftId: draft.id, createdAt });
const submittedImageJob = {
  ...imageJob,
  status: ImageJobStatus.SUBMITTED,
  externalJobId: "comfy-publication",
  updatedAt: createdAt,
};
const succeededImageJob = completeImageJob(
  submittedImageJob,
  "media://publication.png",
  createdAt,
);
const readyDraft = transitionMomentDraft(
  { ...draft, imageJobId: imageJob.id },
  MomentDraftStatus.READY,
  createdAt,
);

function repositories() {
  return createInMemoryRepositories({
    worlds: [world],
    characters: [author, reader],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    eventExecutions: [execution],
    behaviorActions: [action],
    momentDrafts: [readyDraft],
    imageJobs: [succeededImageJob],
  });
}

test("publishes a READY image draft into a visible Moment", async () => {
  const store = repositories();
  const coordinator = new MomentPublicationCoordinator(store);
  const moment = await coordinator.publish({
    id: "publication-moment",
    draftId: readyDraft.id,
    publishedAt: "2026-08-05T15:01:00.000Z",
    audienceCharacterIds: [author.id, reader.id],
  });
  assert.equal(moment.imageMediaRef, "media://publication.png");
  assert.deepEqual(moment.audienceCharacterIds, [author.id, reader.id]);
  assert.equal((await store.momentDrafts?.getById(readyDraft.id))?.status, MomentDraftStatus.PUBLISHED);
  assert.deepEqual(await store.moments?.getById(moment.id), moment);
});

test("replays publication by moment id without duplicating the feed record", async () => {
  const store = repositories();
  const coordinator = new MomentPublicationCoordinator(store);
  const input = {
    id: "publication-replay-moment",
    draftId: readyDraft.id,
    publishedAt: "2026-08-05T15:01:00.000Z",
    audienceCharacterIds: [author.id, reader.id],
  };
  const first = await coordinator.publish(input);
  const second = await coordinator.publish({ ...input, publishedAt: "2026-08-05T16:00:00.000Z" });
  assert.deepEqual(second, first);
  if (!store.moments) throw new Error("moment repository missing from test fixture");
  assert.equal((await store.moments.listFeed(world.id, reader.id, 10)).length, 1);
});

test("does not publish drafts whose image job has not succeeded", async () => {
  const store = createInMemoryRepositories({
    worlds: [world],
    characters: [author, reader],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    eventExecutions: [execution],
    behaviorActions: [action],
    momentDrafts: [readyDraft],
    imageJobs: [{ ...imageJob, status: ImageJobStatus.FAILED, failureReason: "offline", updatedAt: createdAt }],
  });
  const coordinator = new MomentPublicationCoordinator(store);
  await assert.rejects(
    coordinator.publish({
      id: "publication-failed-moment",
      draftId: readyDraft.id,
      publishedAt: createdAt,
      audienceCharacterIds: [author.id, reader.id],
    }),
    { name: "TypeError", message: /must be SUCCEEDED/ },
  );
  assert.equal((await store.momentDrafts?.getById(readyDraft.id))?.status, MomentDraftStatus.READY);
});

test("manual review mode blocks publication until explicitly approved", async () => {
  const store = repositories();
  const draft = await store.momentDrafts?.getById("publication-draft");
  assert.ok(draft);
  const coordinator = new MomentPublicationCoordinator(store, { manualReviewBeforePublish: true });
  await assert.rejects(
    coordinator.publish({ id: "manual-review-moment", draftId: draft.id, publishedAt: createdAt }),
    /manual review approval/,
  );
  const published = await coordinator.publish({
    id: "manual-review-moment",
    draftId: draft.id,
    publishedAt: createdAt,
    manualReviewApproved: true,
    audienceCharacterIds: [author.id, reader.id],
  });
  assert.equal(published.id, "manual-review-moment");
});

test("validates publication repository, draft, audience, and image boundaries", async () => {
  const store = repositories();
  assert.throws(() => new MomentPublicationCoordinator({ ...store, momentDrafts: undefined, moments: undefined } as unknown as typeof store), /repositories are not configured/);
  const coordinator = new MomentPublicationCoordinator(store);
  await assert.rejects(coordinator.publish({ id: "missing-draft", draftId: "missing", publishedAt: createdAt }), /Moment draft not found/);
  const notReadyStore = createInMemoryRepositories({
    worlds: [world],
    characters: [author, reader],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    eventExecutions: [execution],
    behaviorActions: [action],
    momentDrafts: [{ ...readyDraft, status: MomentDraftStatus.DRAFT }],
    imageJobs: [succeededImageJob],
  });
  await assert.rejects(new MomentPublicationCoordinator(notReadyStore).publish({ id: "not-ready", draftId: readyDraft.id, publishedAt: createdAt }), /READY/);

  const unknownAudience = await assert.rejects(coordinator.publish({ id: "unknown-audience", draftId: readyDraft.id, publishedAt: createdAt, audienceCharacterIds: ["missing"] }), /Unknown moment audience/);
  assert.equal(unknownAudience, undefined);

  const imageDraft = { ...readyDraft, imageJobId: "missing-image" };
  const imageStore = createInMemoryRepositories({
    worlds: [world],
    characters: [author, reader],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    eventExecutions: [execution],
    behaviorActions: [action],
    momentDrafts: [imageDraft],
    imageJobs: [],
  });
  await assert.rejects(new MomentPublicationCoordinator(imageStore).publish({ id: "missing-image-moment", draftId: imageDraft.id, publishedAt: createdAt }), /Image job not found/);
  const { imageJobId: _imageJobId, ...textOnly } = readyDraft;
  const textStore = createInMemoryRepositories({
    worlds: [world],
    characters: [author, reader],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    eventExecutions: [execution],
    behaviorActions: [action],
    momentDrafts: [textOnly],
  });
  const textMoment = await new MomentPublicationCoordinator(textStore).publish({ id: "text-only-moment", draftId: textOnly.id, publishedAt: createdAt, audienceCharacterIds: [author.id, reader.id] });
  assert.equal(textMoment.imageMediaRef, undefined);
});
