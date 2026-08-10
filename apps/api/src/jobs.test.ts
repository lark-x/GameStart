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
  submitImageJob,
  completeImageJob,
} from "../../../packages/domain/src/index.ts";
import { ImageAssetCategory } from "../../../packages/contracts/src/index.ts";
import { ApiApplication, createApiStore } from "./index.ts";

const world = createStoryWorld({
  id: "job-api-world",
  name: "Job API World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "job-api-character",
  displayName: "Job Character",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T16:00:00.000Z";
const definition = createWorldEventDefinition({
  id: "job-api-definition",
  storyWorld: world,
  eventKey: "job-api:event",
  name: "Job API event",
  triggerSource: TriggerSource.MANUAL,
  recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T10:00:00.000Z" },
  targetCharacters: [character],
  createdAt,
});
const occurrence = createScheduledOccurrence({
  id: "job-api-occurrence",
  definition,
  scheduledFor: "2026-08-06T10:00:00.000Z",
  occurrenceKey: "job-api:once",
  createdAt,
});
const execution = createEventExecution({
  id: "job-api-execution",
  occurrence,
  definition,
  ruleVersion: "rules-v1",
  inputSnapshot: {},
  startedAt: "2026-08-06T10:00:01.000Z",
});
const action = createBehaviorAction({
  id: "job-api-action",
  execution,
  actorCharacterId: character.id,
  kind: ActionKind.REQUEST_IMAGE,
  payload: { prompt: "job status", workflowVersion: "moment@v1" },
  createdAt,
});
const imageJob = createImageJob({ id: "job-api-image", action, createdAt });

const eventImage = completeImageJob(
  submitImageJob(imageJob, "event-output", "2026-08-06T10:00:02.000Z"),
  "media://local/event.png",
  "2026-08-06T10:00:03.000Z",
);
const chatAction = createBehaviorAction({
  id: "job-api-chat-action",
  execution,
  actorCharacterId: character.id,
  kind: ActionKind.REQUEST_IMAGE,
  payload: {
    prompt: "chat portrait",
    workflowVersion: "moment@v1",
    conversationId: "conversation-1",
    recipientCharacterId: character.id,
  },
  createdAt,
});
const chatImage = completeImageJob(
  submitImageJob(createImageJob({ id: "job-api-chat-image", action: chatAction, createdAt }), "chat-output", "2026-08-06T10:00:04.000Z"),
  "media://local/chat.png",
  "2026-08-06T10:00:05.000Z",
);
const momentAction = createBehaviorAction({
  id: "job-api-moment-action",
  execution,
  actorCharacterId: character.id,
  kind: ActionKind.CREATE_MOMENT,
  payload: { body: "A new moment", imagePrompt: "moment portrait", workflowVersion: "moment@v1" },
  createdAt,
});
const momentDraft = createMomentDraft({ id: "job-api-moment-draft", action: momentAction, visibility: "PUBLIC", createdAt });
const momentImage = completeImageJob(
  submitImageJob(createImageJob({ id: "job-api-moment-image", action: momentAction, momentDraftId: momentDraft.id, createdAt }), "moment-output", "2026-08-06T10:00:06.000Z"),
  "media://local/moment.png",
  "2026-08-06T10:00:07.000Z",
);

function createApplication() {
  return new ApiApplication(createApiStore({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    eventExecutions: [execution],
    behaviorActions: [action],
    imageJobs: [imageJob],
  }));
}

function createAlbumApplication() {
  return new ApiApplication(createApiStore({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    eventExecutions: [execution],
    behaviorActions: [action, chatAction, momentAction],
    momentDrafts: [momentDraft],
    imageJobs: [eventImage, chatImage, momentImage],
  }));
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

test("returns image job lifecycle status for clients", async () => {
  const response = await createApplication().handle(
    new Request(`http://localhost/v1/image-jobs/${imageJob.id}`),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), { data: imageJob });
});

test("bounds missing image jobs and unsupported methods", async () => {
  const missing = await createApplication().handle(
    new Request("http://localhost/v1/image-jobs/missing"),
  );
  assert.equal(missing.status, 404);
  const method = await createApplication().handle(
    new Request(`http://localhost/v1/image-jobs/${imageJob.id}`, { method: "POST" }),
  );
  assert.equal(method.status, 405);
});

test("lists all completed ComfyUI outputs with album categories", async () => {
  const response = await createAlbumApplication().handle(
    new Request(`http://localhost/v1/image-assets?storyWorldId=${world.id}`),
  );
  assert.equal(response.status, 200);
  const payload = await response.json() as { data: Array<{ id: string; category: string; mediaRef: string; conversationId?: string }> };
  assert.deepEqual(payload.data.map((asset) => asset.id), [momentImage.id, chatImage.id, eventImage.id]);
  assert.deepEqual(payload.data.map((asset) => asset.category), [
    ImageAssetCategory.MOMENT,
    ImageAssetCategory.CHAT,
    ImageAssetCategory.EVENT,
  ]);
  assert.equal(payload.data[1]?.conversationId, "conversation-1");
  assert.equal(payload.data[0]?.mediaRef, "media://local/moment.png");
});

test("validates image album queries and methods", async () => {
  const missingWorld = await createAlbumApplication().handle(new Request("http://localhost/v1/image-assets"));
  assert.equal(missingWorld.status, 400);
  const method = await createAlbumApplication().handle(new Request(
    `http://localhost/v1/image-assets?storyWorldId=${world.id}`,
    { method: "POST" },
  ));
  assert.equal(method.status, 405);
});
