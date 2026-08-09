import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  EventRecurrenceKind,
  StoryMode,
  TriggerSource,
  createCharacter,
  createComfyUiSettings,
  createConversation,
  createProactiveMessageBudget,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
  type EventExecution,
} from "../../../packages/domain/src/index.ts";
import { createInMemoryRepositories } from "../../../packages/database/src/index.ts";
import { createWorkerRuntime, processWorkerOccurrence } from "./runtime.ts";

const createdAt = "2026-08-09T00:00:00.000Z";
const executedAt = "2026-08-09T01:00:00.000Z";

function fixture(outputs: { sendMessage: boolean; publishMoment: boolean; generateImage: boolean }) {
  const world = createStoryWorld({
    id: "event-output-world",
    name: "Event Outputs",
    timezone: "UTC",
    storyMode: StoryMode.STATIC,
    relationshipDynamicsEnabled: false,
  });
  const user = createCharacter({
    id: "event-output-user",
    displayName: "User",
    role: CharacterRole.USER,
    storyWorldId: world.id,
    timezone: world.timezone,
  });
  const ai = createCharacter({
    id: "event-output-ai",
    displayName: "Nia",
    role: CharacterRole.AI,
    storyWorldId: world.id,
    timezone: world.timezone,
  });
  const conversation = createConversation({
    id: "event-output-conversation",
    storyWorld: world,
    type: "PRIVATE",
    members: [user, ai],
    createdAt,
  });
  const definition = createWorldEventDefinition({
    id: "event-output-definition",
    storyWorld: world,
    eventKey: "manual:event-output",
    name: "Observatory opens",
    triggerSource: TriggerSource.MANUAL,
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: executedAt },
    targetCharacters: [ai],
    recipientCharacters: [user],
    outputs,
    createdAt,
  });
  const occurrence = createScheduledOccurrence({
    id: "event-output-occurrence",
    definition,
    scheduledFor: executedAt,
    occurrenceKey: "event-output:once",
    createdAt,
  });
  const budget = createProactiveMessageBudget({
    id: "event-output-budget",
    storyWorld: world,
    character: ai,
    windowStartsAt: createdAt,
    windowEndsAt: "2026-08-10T00:00:00.000Z",
    limit: 10,
    updatedAt: createdAt,
  });
  const comfy = createComfyUiSettings({
    id: "default",
    baseUrl: "http://127.0.0.1:8188",
    timeoutMs: 30_000,
    defaultWorkflowVersion: "moment@v1",
    autoImageIntentEnabled: false,
    updatedAt: createdAt,
  });
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [user, ai],
    conversations: [conversation],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    proactiveMessageBudgets: [budget],
    comfyUiSettings: comfy,
  });
  const runtime = createWorkerRuntime(repositories, {
    execution: () => new Date(executedAt),
    output: () => new Date(executedAt),
  });
  return { world, user, ai, definition, occurrence, budget, repositories, runtime };
}

type OutputSnapshot = {
  outputs: Record<string, { status?: string; diagnostics?: readonly string[] }>;
};

function outputState(execution: EventExecution | undefined): OutputSnapshot | undefined {
  return execution?.outputSnapshot as unknown as OutputSnapshot | undefined;
}

test("worker creates idempotent message, moment, and image outputs then completes the occurrence", async () => {
  const value = fixture({ sendMessage: true, publishMoment: true, generateImage: true });
  const kind = await processWorkerOccurrence(value.runtime, {
    occurrenceId: value.occurrence.id,
    execution: { ruleVersion: "event-output-v1" },
  });
  assert.equal(kind, "STARTED");

  const executions = value.repositories.eventExecutions!;
  const occurrences = value.repositories.scheduledOccurrences!;
  const messages = value.repositories.messages!;
  const actions = value.repositories.behaviorActions!;
  const moments = value.repositories.moments!;
  const jobs = value.repositories.imageJobs!;
  const execution = await executions.getLatestByOccurrence(value.occurrence.id);
  assert.equal(execution?.status, "COMPLETED");
  assert.equal((await occurrences.getById(value.occurrence.id))?.status, "COMPLETED");
  const outputs = outputState(execution);
  assert.equal(outputs?.outputs?.sendMessage?.status, "CREATED");
  assert.equal(outputs?.outputs?.publishMoment?.status, "CREATED");
  assert.equal(outputs?.outputs?.generateImage?.status, "CREATED");

  const savedMessages = await messages.listByConversation("event-output-conversation");
  assert.deepEqual(savedMessages.map((message) => [message.kind, message.text]), [["SYSTEM", "World event: Observatory opens."]]);
  assert.equal((await actions.listByExecution(execution!.id)).length, 3);
  assert.ok(await moments.getById(`event-output:${execution!.id}:published-moment:${value.ai.id}`));
  assert.ok(await jobs.getByActionId(`event-output:${execution!.id}:image:${value.ai.id}`));

  const replay = await processWorkerOccurrence(value.runtime, {
    occurrenceId: value.occurrence.id,
    execution: { ruleVersion: "event-output-v1" },
  });
  assert.equal(replay, "ALREADY_FINISHED");
  assert.equal((await messages.listByConversation("event-output-conversation")).length, 1);
  assert.equal((await actions.listByExecution(execution!.id)).length, 3);
});

test("legacy no-output events complete without actions, messages, image jobs, or proactive budget usage", async () => {
  const value = fixture({ sendMessage: false, publishMoment: false, generateImage: false });
  await processWorkerOccurrence(value.runtime, {
    occurrenceId: value.occurrence.id,
    execution: { ruleVersion: "legacy-v1" },
  });
  const execution = await value.repositories.eventExecutions!.getLatestByOccurrence(value.occurrence.id);
  assert.equal(execution?.status, "COMPLETED");
  const outputs = outputState(execution);
  assert.equal(outputs?.outputs?.sendMessage?.status, "SKIPPED");
  assert.equal(outputs?.outputs?.publishMoment?.status, "SKIPPED");
  assert.equal(outputs?.outputs?.generateImage?.status, "SKIPPED");
  assert.equal((await value.repositories.messages!.listByConversation("event-output-conversation")).length, 0);
  assert.equal((await value.repositories.behaviorActions!.listByExecution(execution!.id)).length, 0);
  assert.equal((await value.repositories.imageJobs!.listQueued()).length, 0);
  assert.equal((await value.repositories.proactiveMessageBudgets!.getActive(value.world.id, value.ai.id, executedAt))?.consumed, 0);
});

test("an optional delivery failure is recorded while the event still completes", async () => {
  const value = fixture({ sendMessage: true, publishMoment: true, generateImage: true });
  const noConversationRepositories = createInMemoryRepositories({
    worlds: [value.world],
    characters: [value.user, value.ai],
    worldEventDefinitions: [value.definition],
    scheduledOccurrences: [value.occurrence],
    comfyUiSettings: createComfyUiSettings({
      id: "default",
      baseUrl: "http://127.0.0.1:8188",
      timeoutMs: 30_000,
      autoImageIntentEnabled: false,
      updatedAt: createdAt,
    }),
  });
  const runtime = createWorkerRuntime(noConversationRepositories, {
    execution: () => new Date(executedAt),
    output: () => new Date(executedAt),
  });
  await processWorkerOccurrence(runtime, {
    occurrenceId: value.occurrence.id,
    execution: { ruleVersion: "partial-v1", proactiveMessageUnits: 0 },
  });
  const execution = await noConversationRepositories.eventExecutions!.getLatestByOccurrence(value.occurrence.id);
  assert.equal(execution?.status, "COMPLETED");
  const outputs = outputState(execution);
  assert.equal(outputs?.outputs?.sendMessage?.status, "FAILED");
  assert.equal(outputs?.outputs?.publishMoment?.status, "CREATED");
  assert.equal(outputs?.outputs?.generateImage?.status, "SKIPPED");
  assert.match(String(outputs?.outputs?.sendMessage?.diagnostics), /no active conversation/);
});
