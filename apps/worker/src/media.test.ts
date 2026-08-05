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
  createCharacter,
  createEventExecution,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
} from "../../../packages/domain/src/index.ts";
import { createInMemoryRepositories } from "../../../packages/database/src/index.ts";
import {
  BehaviorMediaCoordinator,
  ComfyUiError,
  ComfyUiHttpClient,
  FakeComfyUiClient,
  type ComfyUiFetchImplementation,
  createBehaviorMediaCoordinator,
} from "./index.ts";

const world = createStoryWorld({
  id: "world-media-worker",
  name: "Media Worker Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "media-worker-character",
  displayName: "Aster",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = new Date("2026-08-01T00:00:00.000Z");

function fixture() {
  const definition = createWorldEventDefinition({
    id: "media-worker-definition",
    storyWorld: world,
    eventKey: "world:media-worker",
    name: "Media worker event",
    triggerSource: TriggerSource.WORLD_HOLIDAY,
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-15T10:00:00.000Z" },
    targetCharacters: [character],
    createdAt: createdAt.toISOString(),
  });
  const occurrence = createScheduledOccurrence({
    id: "media-worker-occurrence",
    definition,
    scheduledFor: "2026-08-15T10:00:00.000Z",
    occurrenceKey: "media-worker:2026-08-15",
    createdAt: createdAt.toISOString(),
  });
  const execution = createEventExecution({
    id: "media-worker-execution",
    occurrence,
    definition,
    ruleVersion: "rules-v1",
    inputSnapshot: {},
    startedAt: "2026-08-15T10:00:01.000Z",
  });
  return { definition, occurrence, execution };
}

function makeRepositories() {
  const data = fixture();
  return {
    data,
    repositories: createInMemoryRepositories({
      worlds: [world],
      characters: [character],
      worldEventDefinitions: [data.definition],
      scheduledOccurrences: [data.occurrence],
      eventExecutions: [data.execution],
    }),
  };
}

test("plans a moment action, creates a draft/image job, and replays idempotently", async () => {
  const { data, repositories } = makeRepositories();
  const coordinator = createBehaviorMediaCoordinator(
    repositories,
    new FakeComfyUiClient(),
    () => createdAt,
  );
  assert.ok(repositories.momentDrafts);
  assert.ok(repositories.imageJobs);
  const action = await coordinator.planAction({
    id: "media-worker-action",
    executionId: data.execution.id,
    actorCharacterId: character.id,
    kind: ActionKind.CREATE_MOMENT,
    payload: {
      body: "A festival moment.",
      imagePrompt: "anime character holding lanterns",
      workflowVersion: "wf-v1",
    },
  });
  assert.equal(action.kind, ActionKind.CREATE_MOMENT);
  assert.equal((await repositories.momentDrafts.getByActionId(action.id))?.status, "DRAFT");
  const job = await repositories.imageJobs.getByActionId(action.id);
  assert.ok(job);
  assert.equal(job.status, ImageJobStatus.QUEUED);
  const replay = await coordinator.planAction({
    id: action.id,
    executionId: data.execution.id,
    actorCharacterId: character.id,
    kind: ActionKind.CREATE_MOMENT,
    payload: { body: "different" },
  });
  assert.deepEqual(replay, action);
});

test("submits and completes Fake ComfyUI jobs, promoting the moment draft to READY", async () => {
  const { data, repositories } = makeRepositories();
  const coordinator = createBehaviorMediaCoordinator(
    repositories,
    new FakeComfyUiClient(),
    () => createdAt,
  );
  assert.ok(repositories.momentDrafts);
  assert.ok(repositories.imageJobs);
  const action = await coordinator.planAction({
    id: "media-worker-submit-action",
    executionId: data.execution.id,
    actorCharacterId: character.id,
    kind: ActionKind.CREATE_MOMENT,
    payload: {
      body: "Ready after image.",
      imagePrompt: "anime lanterns",
      workflowVersion: "wf-v1",
    },
  });
  const queued = await repositories.imageJobs.getByActionId(action.id);
  assert.ok(queued);
  const submitted = await coordinator.submitImageJob(queued.id);
  assert.equal(submitted.status, ImageJobStatus.SUBMITTED);
  assert.equal(submitted.externalJobId, `fake-comfy:${queued.id}`);
  const succeeded = await coordinator.completeImageJob(queued.id);
  assert.equal(succeeded.status, ImageJobStatus.SUCCEEDED);
  assert.match(succeeded.mediaRef ?? "", /media:\/\/fake-comfy/);
  const draft = await repositories.momentDrafts.getByActionId(action.id);
  assert.equal(draft?.status, MomentDraftStatus.READY);
});

test("fails image jobs and rejects their draft without pretending publication", async () => {
  const { data, repositories } = makeRepositories();
  const coordinator = new BehaviorMediaCoordinator(
    repositories,
    new FakeComfyUiClient(),
    () => createdAt,
  );
  assert.ok(repositories.momentDrafts);
  assert.ok(repositories.imageJobs);
  const action = await coordinator.planAction({
    id: "media-worker-fail-action",
    executionId: data.execution.id,
    actorCharacterId: character.id,
    kind: ActionKind.CREATE_MOMENT,
    payload: {
      body: "Failed image.",
      imagePrompt: "offline",
      workflowVersion: "wf-v1",
    },
  });
  const queued = await repositories.imageJobs.getByActionId(action.id);
  assert.ok(queued);
  const failed = await coordinator.failImageJob(queued.id, "Fake ComfyUI offline");
  assert.equal(failed.status, ImageJobStatus.FAILED);
  assert.equal(
    (await repositories.momentDrafts.getByActionId(action.id))?.status,
    MomentDraftStatus.REJECTED,
  );
  const retried = await coordinator.retryImageJob(queued.id, 3);
  assert.equal(retried.status, ImageJobStatus.QUEUED);
  assert.equal(retried.attempt, 2);
  assert.equal(
    (await repositories.momentDrafts.getByActionId(action.id))?.status,
    MomentDraftStatus.DRAFT,
  );
});

test("requires behavior/media repositories before construction", () => {
  const { repositories } = makeRepositories();
  const incomplete = {
    storyWorlds: repositories.storyWorlds,
    characters: repositories.characters,
    relationshipEdges: repositories.relationshipEdges,
    actorSessions: repositories.actorSessions,
  };
  assert.throws(() => createBehaviorMediaCoordinator(incomplete, new FakeComfyUiClient()), {
    name: "TypeError",
    message: /repositories are not configured/,
  });
});

test("submits workflows and resolves ComfyUI history output", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl: ComfyUiFetchImplementation = async (input, init) => {
    calls.push(init === undefined ? { input } : { input, init });
    if (String(input).endsWith("/prompt")) {
      return new Response(JSON.stringify({ prompt_id: "prompt-123" }), { status: 200 });
    }
    return new Response(JSON.stringify({
      "prompt-123": {
        outputs: {
          "9": {
            images: [{ filename: "image.png", subfolder: "session", type: "output" }],
          },
        },
      },
    }), { status: 200 });
  };
  const client = new ComfyUiHttpClient({
    baseUrl: "http://comfy.example/",
    timeoutMs: 5000,
    clientId: "worker-test",
  }, fetchImpl);
  const submitted = await client.submit({
    jobId: "job-123",
    workflowVersion: "wf-v1",
    prompt: "lanterns",
    workflow: { "1": { class_type: "CheckpointLoaderSimple" } },
    seed: 42,
  });
  assert.deepEqual(submitted, { externalJobId: "prompt-123" });
  const result = await client.getResult(submitted.externalJobId);
  assert.equal(result.externalJobId, "prompt-123");
  assert.match(result.mediaRef, /^http:\/\/comfy\.example\/view\?/);
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.deepEqual(body.prompt, { "1": { class_type: "CheckpointLoaderSimple" } });
  assert.equal(body.client_id, "worker-test");
  assert.equal(calls[1]?.input, "http://comfy.example/history/prompt-123");
});

test("normalizes ComfyUI not-ready and HTTP failures as bounded errors", async () => {
  const notReadyFetch: ComfyUiFetchImplementation = async () =>
    new Response(JSON.stringify({}), { status: 200 });
  const notReady = new ComfyUiHttpClient({ baseUrl: "http://comfy.example" }, notReadyFetch);
  await assert.rejects(
    notReady.getResult("pending"),
    (error: unknown) => {
      assert.ok(error instanceof ComfyUiError);
      assert.equal(error.code, "NOT_READY");
      assert.equal(error.retryable, true);
      return true;
    },
  );
  const failed = new ComfyUiHttpClient(
    { baseUrl: "http://comfy.example" },
    async () => new Response("secret backend detail", { status: 503 }),
  );
  await assert.rejects(
    failed.getResult("job"),
    (error: unknown) => {
      assert.ok(error instanceof ComfyUiError);
      assert.equal(error.code, "HTTP_ERROR");
      assert.equal(error.retryable, true);
      assert.equal(error.status, 503);
      assert.equal(error.message.includes("secret backend detail"), true);
      return true;
    },
  );
  assert.throws(
    () => new ComfyUiHttpClient({ baseUrl: "file:///tmp/comfy" }),
    { name: "ComfyUiError", message: /http or https/ },
  );
});

test("retries a not-ready image result within a bounded polling window", async () => {
  const { data, repositories } = makeRepositories();
  let calls = 0;
  const client = {
    async submit() { return { externalJobId: "retry-external" }; },
    async getResult() {
      calls += 1;
      if (calls === 1) throw new ComfyUiError("NOT_READY", "still rendering", { retryable: true });
      return { externalJobId: "retry-external", mediaRef: "media://retry/result.png" };
    },
  };
  const coordinator = createBehaviorMediaCoordinator(repositories, client, () => createdAt);
  const action = await coordinator.planAction({
    id: "retry-action",
    executionId: data.execution.id,
    actorCharacterId: character.id,
    kind: ActionKind.REQUEST_IMAGE,
    payload: { prompt: "a retry", workflowVersion: "retry@v1" },
  });
  const job = await repositories.imageJobs!.getByActionId(action.id);
  assert.ok(job);
  await coordinator.submitImageJob(job.id);
  const completed = await coordinator.completeImageJobWithRetry(job.id, { maxAttempts: 2, delayMs: 0 });
  assert.equal(completed.status, ImageJobStatus.SUCCEEDED);
  assert.equal(calls, 2);
});
