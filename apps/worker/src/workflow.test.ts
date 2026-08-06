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
  createCharacterVisualIdentity,
  createEventExecution,
  createImageJob,
  createImageWorkflowTemplate,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
} from "../../../packages/domain/src/index.ts";
import { createInMemoryRepositories } from "../../../packages/database/src/index.ts";
import {
  BehaviorMediaCoordinator,
  RepositoryImageWorkflowResolver,
  type ComfyUiClient,
  type ComfyUiSubmitRequest,
} from "./media.ts";

const world = createStoryWorld({
  id: "workflow-worker-world",
  name: "Workflow Worker World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "workflow-worker-character",
  displayName: "Nia",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const identity = createCharacterVisualIdentity({
  id: "workflow-worker-identity",
  characterId: character.id,
  storyWorldId: world.id,
  positivePrompt: "red-haired astronomer",
  negativePrompt: "low quality",
  styleTags: ["anime illustration"],
  updatedAt: "2026-08-05T14:00:00.000Z",
});
const template = createImageWorkflowTemplate({
  id: "moment",
  version: "v1",
  workflow: {
    positive: { inputs: { text: "placeholder" } },
    negative: { inputs: { text: "default negative" } },
    sampler: { inputs: { seed: 1 } },
  },
  positivePromptPath: ["positive", "inputs", "text"],
  negativePromptPath: ["negative", "inputs", "text"],
  seedPath: ["sampler", "inputs", "seed"],
});

const definition = createWorldEventDefinition({
  id: "workflow-worker-definition",
  storyWorld: world,
  eventKey: "workflow-worker:event",
  name: "Workflow worker event",
  triggerSource: TriggerSource.MANUAL,
  recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T10:00:00.000Z" },
  targetCharacters: [character],
  createdAt: "2026-08-05T14:00:00.000Z",
});
const occurrence = createScheduledOccurrence({
  id: "workflow-worker-occurrence",
  definition,
  scheduledFor: "2026-08-06T10:00:00.000Z",
  occurrenceKey: "workflow-worker:once",
  createdAt: "2026-08-05T14:00:00.000Z",
});
const execution = createEventExecution({
  id: "workflow-worker-execution",
  occurrence,
  definition,
  ruleVersion: "rules-v1",
  inputSnapshot: {},
  startedAt: "2026-08-06T10:00:01.000Z",
});
const action = createBehaviorAction({
  id: "workflow-worker-action",
  execution,
  actorCharacterId: character.id,
  kind: ActionKind.REQUEST_IMAGE,
  payload: {
    prompt: "under a glass observatory dome",
    workflowVersion: "moment@v1",
    seed: 17,
  },
  createdAt: "2026-08-05T14:00:00.000Z",
});
const job = createImageJob({
  id: "workflow-worker-job",
  action,
  createdAt: "2026-08-05T14:00:00.000Z",
});

function makeRepositories() {
  return createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    eventExecutions: [execution],
    behaviorActions: [action],
    imageJobs: [job],
    characterVisualIdentities: [identity],
    imageWorkflowTemplates: [template],
  });
}

function makeResolver(repositories: ReturnType<typeof makeRepositories>): RepositoryImageWorkflowResolver {
  if (!repositories.characterVisualIdentities || !repositories.imageWorkflowTemplates) {
    throw new Error("visual repositories missing from test fixture");
  }
  return new RepositoryImageWorkflowResolver({
    characterVisualIdentities: repositories.characterVisualIdentities,
    imageWorkflowTemplates: repositories.imageWorkflowTemplates,
  });
}

class CapturingComfyUiClient implements ComfyUiClient {
  public request: ComfyUiSubmitRequest | undefined;

  public async submit(request: ComfyUiSubmitRequest): Promise<{ externalJobId: string }> {
    this.request = request;
    return { externalJobId: "captured-job" };
  }

  public async getResult(externalJobId: string) {
    return { externalJobId, mediaRef: "media://captured.png" };
  }
}

test("resolves a versioned template with character identity into a workflow graph", async () => {
  const repositories = makeRepositories();
  const resolver = makeResolver(repositories);
  const workflow = await resolver.resolve(job);
  assert.equal(
    (workflow.positive as { inputs: { text: string } }).inputs.text,
    "red-haired astronomer, anime illustration, under a glass observatory dome",
  );
  assert.equal(
    (workflow.negative as { inputs: { text: string } }).inputs.text,
    "low quality",
  );
  assert.equal((workflow.sampler as { inputs: { seed: number } }).inputs.seed, 17);
});

test("BehaviorMediaCoordinator submits the resolved workflow to ComfyUI", async () => {
  const repositories = makeRepositories();
  const comfyUi = new CapturingComfyUiClient();
  const coordinator = new BehaviorMediaCoordinator(
    repositories,
    comfyUi,
    () => new Date("2026-08-05T14:00:00.000Z"),
    makeResolver(repositories),
  );
  const submitted = await coordinator.submitImageJob(job.id);
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(comfyUi.request?.workflowVersion, "moment@v1");
  assert.deepEqual(comfyUi.request?.workflow, {
    positive: { inputs: { text: "red-haired astronomer, anime illustration, under a glass observatory dome" } },
    negative: { inputs: { text: "low quality" } },
    sampler: { inputs: { seed: 17 } },
  });
});

test("resolver rejects missing template references without changing queued jobs", async () => {
  const repositories = makeRepositories();
  const resolver = makeResolver(repositories);
  await assert.rejects(
    resolver.resolve({ ...job, workflowVersion: "missing@v1" }),
    { name: "ComfyUiError", message: /template not found/ },
  );
  if (!repositories.imageJobs) throw new Error("image repository missing from test fixture");
  assert.equal((await repositories.imageJobs.getById(job.id))?.status, "QUEUED");
});
