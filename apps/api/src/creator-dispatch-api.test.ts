import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  EventRecurrenceKind,
  ScheduledOccurrenceStatus,
  StoryMode,
  TriggerSource,
  completeEventExecution,
  createCharacter,
  createComfyUiSettings,
  createConversation,
  createImageWorkflowTemplate,
  createProactiveMessageBudget,
  createEventExecution,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
  transitionOccurrence,
} from "@living-network/domain";
import type { DomainRepositories, InMemoryRepositorySeed } from "@living-network/database";
import type {
  CreatorEventCandidateDto,
  EventDispatchBatchDto,
  EventDispatchPreviewDto,
} from "@living-network/contracts";
import { ApiApplication, createApiStore } from "./index.ts";
import type { CreatorEventCandidatesResponse } from "./index.ts";

const NOW = "2026-08-09T00:00:00.000Z";
const world = createStoryWorld({
  id: "creator-world",
  name: "Creator World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const actor = createCharacter({
  id: "creator-actor",
  displayName: "Creator Actor",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});

const recipient = createCharacter({
  id: "creator-recipient",
  displayName: "Creator Recipient",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});

function riskEvent(id: string, generateImage = false) {
  return createWorldEventDefinition({
    id,
    storyWorld: world,
    eventKey: id,
    name: id,
    triggerSource: TriggerSource.STORY_NODE,
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-08T00:00:00.000Z" },
    targetCharacters: [actor],
    recipientCharacters: [recipient],
    outputs: { sendMessage: true, generateImage },
    createdAt: NOW,
  });
}

function event(
  id: string,
  recurrence: { kind: typeof EventRecurrenceKind.ONCE; runAt: string },
  triggerSource: typeof TriggerSource[keyof typeof TriggerSource] = TriggerSource.STORY_NODE,
) {
  return createWorldEventDefinition({
    id,
    storyWorld: world,
    eventKey: id,
    name: id,
    triggerSource,
    recurrence,
    targetCharacters: [actor],
    recipientCharacters: [actor],
    outputs: { sendMessage: true },
    createdAt: NOW,
  });
}

function transactionalStore(
  definitions: readonly ReturnType<typeof event>[],
  occurrences: readonly ReturnType<typeof createScheduledOccurrence>[] = [],
  extra: InMemoryRepositorySeed = {},
) {
  const store = createApiStore({
    ...extra,
    worlds: extra.worlds ?? [world],
    characters: extra.characters ?? [actor],
    worldEventDefinitions: definitions,
    scheduledOccurrences: occurrences,
  });
  const value = store as typeof store & {
    transaction<T>(
      operation: (repositories: DomainRepositories) => Promise<T>,
    ): Promise<T>;
  };
  value.transaction = async <T>(
    operation: (repositories: DomainRepositories) => Promise<T>,
  ): Promise<T> => operation(value);
  return value;
}

function application(store: ReturnType<typeof transactionalStore>, enabled = true) {
  return new ApiApplication(
    store,
    undefined,
    {},
    {},
    {
      creatorDispatchEnabled: enabled,
      creatorClock: () => new Date(NOW),
    },
  );
}

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json() as { data: T };
  return body.data;
}

async function candidateList(response: Response): Promise<CreatorEventCandidateDto[]> {
  return [...(await responseData<CreatorEventCandidatesResponse>(response)).candidates];
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("memory mode permits scan and preview but rejects dispatch and batch reads", async () => {
  const definition = event("memory-event", {
    kind: EventRecurrenceKind.ONCE,
    runAt: "2026-08-08T00:00:00.000Z",
  });
  const app = application(transactionalStore([definition]), false);

  const candidatesResponse = await app.handle(new Request(
    `http://localhost/v1/creator/worlds/${world.id}/event-candidates?horizonDays=7`,
  ));
  assert.equal(candidatesResponse.status, 200);
  const candidateResult = await responseData<CreatorEventCandidatesResponse>(candidatesResponse);
  const candidates = [...candidateResult.candidates];
  assert.equal(candidates.length, 1);
  assert.equal(candidateResult.dispatchAvailable, false);
  assert.equal(candidateResult.workerStatus, "NOT_STARTED");

  const previewResponse = await app.handle(jsonRequest(
    `http://localhost/v1/creator/worlds/${world.id}/event-dispatches/preview`,
    {
      selections: [{
        candidateId: candidates[0]!.id,
        action: "EXECUTE_EXISTING",
      }],
    },
  ));
  assert.equal(previewResponse.status, 200);
  assert.equal((await responseData<EventDispatchPreviewDto>(previewResponse)).canDispatch, true);

  const dispatchResponse = await app.handle(jsonRequest(
    `http://localhost/v1/creator/worlds/${world.id}/event-dispatches`,
    {
      idempotencyKey: "memory",
      selections: [{
        candidateId: candidates[0]!.id,
        action: "EXECUTE_EXISTING",
      }],
    },
  ));
  assert.equal(dispatchResponse.status, 503);

  const batchResponse = await app.handle(new Request(
    "http://localhost/v1/creator/event-dispatches/creator-batch%3Amemory",
  ));
  assert.equal(batchResponse.status, 503);
});

test("dispatch atomically materializes a projected occurrence and is idempotent", async () => {
  const definition = event("projected-event", {
    kind: EventRecurrenceKind.ONCE,
    runAt: "2026-08-08T00:00:00.000Z",
  });
  const store = transactionalStore([definition]);
  const app = application(store);
  const candidates = await candidateList(
    await app.handle(new Request(
      `http://localhost/v1/creator/worlds/${world.id}/event-candidates`,
    )),
  );
  const candidate = candidates[0]!;
  assert.equal(candidate.projected, true);

  const requestBody = {
    idempotencyKey: "projected-batch",
    selections: [{ candidateId: candidate.id, action: "EXECUTE_EXISTING" }],
  };
  const first = await app.handle(jsonRequest(
    `http://localhost/v1/creator/worlds/${world.id}/event-dispatches`,
    requestBody,
  ));
  assert.equal(first.status, 201);
  const batch = await responseData<EventDispatchBatchDto>(first);
  assert.equal(batch.status, "PENDING_DISPATCH");
  assert.equal(batch.items.length, 1);

  const storedOccurrence = await store.scheduledOccurrences!.getByOccurrenceKey(
    world.id,
    candidate.occurrence!.occurrenceKey,
  );
  assert.ok(storedOccurrence);
  assert.equal(storedOccurrence.status, ScheduledOccurrenceStatus.PENDING);
  assert.equal((await store.dispatchRequests!.listByBatch(batch.id)).length, 1);

  const replay = await app.handle(jsonRequest(
    `http://localhost/v1/creator/worlds/${world.id}/event-dispatches`,
    requestBody,
  ));
  assert.equal(replay.status, 201);
  assert.equal((await responseData<EventDispatchBatchDto>(replay)).id, batch.id);
  assert.equal((await store.dispatchRequests!.listByBatch(batch.id)).length, 1);
});

test("RUN_TRIAL creates an immediate occurrence without changing the official schedule", async () => {
  const definition = event("future-event", {
    kind: EventRecurrenceKind.ONCE,
    runAt: "2026-08-10T00:00:00.000Z",
  });
  const official = createScheduledOccurrence({
    id: "official-occurrence",
    definition,
    scheduledFor: "2026-08-10T00:00:00.000Z",
    occurrenceKey: `${definition.id}:${definition.recurrence.kind === "ONCE" ? definition.recurrence.runAt : ""}`,
    createdAt: NOW,
  });
  const store = transactionalStore([definition], [official]);
  const app = application(store);
  const [candidate] = await candidateList(
    await app.handle(new Request(
      `http://localhost/v1/creator/worlds/${world.id}/event-candidates`,
    )),
  );

  const response = await app.handle(jsonRequest(
    `http://localhost/v1/creator/worlds/${world.id}/event-dispatches`,
    {
      idempotencyKey: "trial-batch",
      selections: [{ candidateId: candidate!.id, action: "RUN_TRIAL" }],
    },
  ));
  assert.equal(response.status, 201);
  const batch = await responseData<EventDispatchBatchDto>(response);
  const trial = await store.scheduledOccurrences!.getById(batch.items[0]!.occurrenceId!);
  const unchanged = await store.scheduledOccurrences!.getById(official.id);
  assert.equal(trial!.scheduledFor, NOW);
  assert.notEqual(trial!.id, official.id);
  assert.equal(unchanged!.scheduledFor, official.scheduledFor);
  assert.equal(unchanged!.status, ScheduledOccurrenceStatus.PENDING);
});

test("batch status follows dispatch and execution output state", async () => {
  const definition = event("status-event", {
    kind: EventRecurrenceKind.ONCE,
    runAt: "2026-08-08T00:00:00.000Z",
  });
  const store = transactionalStore([definition]);
  const app = application(store);
  const [candidate] = await candidateList(
    await app.handle(new Request(
      `http://localhost/v1/creator/worlds/${world.id}/event-candidates`,
    )),
  );
  const created = await responseData<EventDispatchBatchDto>(
    await app.handle(jsonRequest(
      `http://localhost/v1/creator/worlds/${world.id}/event-dispatches`,
      {
        idempotencyKey: "status-batch",
        selections: [{ candidateId: candidate!.id, action: "EXECUTE_EXISTING" }],
      },
    )),
  );
  const request = (await store.dispatchRequests!.listByBatch(created.id))[0]!;
  await store.dispatchRequests!.markEnqueued(request.id, "2026-08-09T00:01:00.000Z");

  const pendingOccurrence = (await store.scheduledOccurrences!.getById(request.occurrenceId))!;
  const runningOccurrence = transitionOccurrence(
    transitionOccurrence(pendingOccurrence, ScheduledOccurrenceStatus.ENQUEUED),
    ScheduledOccurrenceStatus.RUNNING,
  );
  await store.scheduledOccurrences!.update(runningOccurrence);
  const runningExecution = createEventExecution({
    id: "execution-status-1",
    occurrence: runningOccurrence,
    definition,
    ruleVersion: "creator-dispatch-v1",
    inputSnapshot: {},
    startedAt: "2026-08-09T00:02:00.000Z",
  });
  await store.eventExecutions!.save(runningExecution);

  const running = await responseData<EventDispatchBatchDto>(
    await app.handle(new Request(
      `http://localhost/v1/creator/event-dispatches/${encodeURIComponent(created.id)}`,
    )),
  );
  assert.equal(running.status, "RUNNING");

  const completedExecution = completeEventExecution(
    runningExecution,
    { messageIds: ["message-1"] },
    "2026-08-09T00:03:00.000Z",
  );
  await store.eventExecutions!.save(completedExecution);
  await store.scheduledOccurrences!.update(
    transitionOccurrence(runningOccurrence, ScheduledOccurrenceStatus.COMPLETED),
  );

  const completed = await responseData<EventDispatchBatchDto>(
    await app.handle(new Request(
      `http://localhost/v1/creator/event-dispatches/${encodeURIComponent(created.id)}`,
    )),
  );
  assert.equal(completed.status, "COMPLETED");
  assert.deepEqual(completed.items[0]!.outputSnapshot, { messageIds: ["message-1"] });
});

test("a changed candidate rejects the whole batch before any write", async () => {
  const definition = event("atomic-event", {
    kind: EventRecurrenceKind.ONCE,
    runAt: "2026-08-08T00:00:00.000Z",
  });
  const store = transactionalStore([definition]);
  const app = application(store);
  const [candidate] = await candidateList(
    await app.handle(new Request(
      `http://localhost/v1/creator/worlds/${world.id}/event-candidates`,
    )),
  );

  const response = await app.handle(jsonRequest(
    `http://localhost/v1/creator/worlds/${world.id}/event-dispatches`,
    {
      idempotencyKey: "atomic-batch",
      selections: [
        { candidateId: candidate!.id, action: "EXECUTE_EXISTING" },
        { candidateId: "missing-candidate", action: "RUN_TRIAL" },
      ],
    },
  ));
  assert.equal(response.status, 409);
  assert.equal((await store.dispatchRequests!.listByBatch("creator-batch:atomic-batch")).length, 0);
  assert.equal(await store.scheduledOccurrences!.getByOccurrenceKey(
    world.id,
    candidate!.occurrence!.occurrenceKey,
  ), undefined);
});


test("candidate metadata reports RUNNING, STALE, and STOPPED worker heartbeats", async () => {
  const definition = event("heartbeat-event", {
    kind: EventRecurrenceKind.ONCE,
    runAt: "2026-08-08T00:00:00.000Z",
  });
  const store = transactionalStore([definition]);
  const app = application(store);
  const read = async (): Promise<CreatorEventCandidatesResponse> =>
    responseData<CreatorEventCandidatesResponse>(
      await app.handle(new Request(
        `http://localhost/v1/creator/worlds/${world.id}/event-candidates`,
      )),
    );

  const notStarted = await read();
  assert.equal(notStarted.dispatchAvailable, true);
  assert.equal(notStarted.workerStatus, "NOT_STARTED");

  await store.dispatchRequests!.heartbeat({
    workerId: "living-network-worker",
    status: "RUNNING",
    heartbeatAt: "2026-08-08T23:59:30.000Z",
    metadata: {},
  });
  assert.equal((await read()).workerStatus, "RUNNING");

  await store.dispatchRequests!.heartbeat({
    workerId: "living-network-worker",
    status: "RUNNING",
    heartbeatAt: "2026-08-08T23:58:59.999Z",
    metadata: {},
  });
  assert.equal((await read()).workerStatus, "STALE");

  await store.dispatchRequests!.heartbeat({
    workerId: "living-network-worker",
    status: "STOPPED",
    heartbeatAt: "2026-08-08T00:00:00.000Z",
    metadata: {},
  });
  assert.equal((await read()).workerStatus, "STOPPED");
});


test("risk enrichment reports real missing dependencies and keeps preview dispatchable", async () => {
  const definition = riskEvent("risk-missing", true);
  const budget = createProactiveMessageBudget({
    id: "risk-budget-exhausted",
    storyWorld: world,
    character: actor,
    windowStartsAt: "2026-08-01T00:00:00.000Z",
    windowEndsAt: "2026-08-10T00:00:00.000Z",
    limit: 1,
    consumed: 1,
    updatedAt: NOW,
  });
  const store = transactionalStore([definition], [], {
    characters: [actor, recipient],
    proactiveMessageBudgets: [budget],
  });
  const app = application(store);
  const result = await responseData<CreatorEventCandidatesResponse>(
    await app.handle(new Request(
      `http://localhost/v1/creator/worlds/${world.id}/event-candidates`,
    )),
  );
  const risks = result.candidates[0]!.risks;
  assert.deepEqual(risks, [
    `接收者 ${recipient.id} 没有可用会话`,
    `角色 ${actor.id} 主动消息预算不足`,
    "未配置默认图片工作流",
  ]);
  assert.equal(risks.includes("需要已配置的图片工作流"), false);
  const preview = await responseData<EventDispatchPreviewDto>(
    await app.handle(jsonRequest(
      `http://localhost/v1/creator/worlds/${world.id}/event-dispatches/preview`,
      { selections: [{ candidateId: result.candidates[0]!.id, action: "EXECUTE_EXISTING" }] },
    )),
  );
  assert.equal(preview.canDispatch, true);
  assert.deepEqual(preview.risks, risks);
});

test("active conversation, available budget, and valid workflow produce no risk", async () => {
  const definition = riskEvent("risk-configured", true);
  const conversation = createConversation({
    id: "risk-conversation",
    storyWorld: world,
    type: "PRIVATE",
    members: [actor, recipient],
    createdAt: NOW,
  });
  const budget = createProactiveMessageBudget({
    id: "risk-budget-available",
    storyWorld: world,
    character: actor,
    windowStartsAt: "2026-08-01T00:00:00.000Z",
    windowEndsAt: "2026-08-10T00:00:00.000Z",
    limit: 2,
    consumed: 1,
    updatedAt: NOW,
  });
  const settings = createComfyUiSettings({
    id: "default",
    baseUrl: "http://127.0.0.1:8188",
    defaultWorkflowVersion: "risk-v1",
    updatedAt: NOW,
  });
  const workflow = createImageWorkflowTemplate({
    id: "risk-workflow",
    version: "risk-v1",
    workflow: { node: { inputs: { text: "placeholder" } } },
    positivePromptPath: ["node", "inputs", "text"],
  });
  const result = await responseData<CreatorEventCandidatesResponse>(
    await application(transactionalStore([definition], [], {
      characters: [actor, recipient],
      conversations: [conversation],
      proactiveMessageBudgets: [budget],
      comfyUiSettings: settings,
      imageWorkflowTemplates: [workflow],
    })).handle(new Request(
      `http://localhost/v1/creator/worlds/${world.id}/event-candidates`,
    )),
  );
  assert.deepEqual(result.candidates[0]!.risks, []);
});

test("unavailable conversations and unknown configured workflow are explicit", async () => {
  const definition = riskEvent("risk-unavailable", true);
  const settings = createComfyUiSettings({
    id: "default",
    baseUrl: "http://127.0.0.1:8188",
    defaultWorkflowVersion: "missing-v1",
    updatedAt: NOW,
  });
  const store = transactionalStore([definition], [], {
    characters: [actor, recipient],
    comfyUiSettings: settings,
  });
  (store as unknown as { conversations: undefined }).conversations = undefined;
  const result = await responseData<CreatorEventCandidatesResponse>(
    await application(store).handle(new Request(
      `http://localhost/v1/creator/worlds/${world.id}/event-candidates`,
    )),
  );
  assert.deepEqual(result.candidates[0]!.risks, [
    "会话仓储不可用",
    "默认图片工作流版本不存在",
  ]);
});
