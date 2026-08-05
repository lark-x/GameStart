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
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
} from "../../../packages/domain/src/index.ts";
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
