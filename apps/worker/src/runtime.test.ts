import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  EventRecurrenceKind,
  StoryMode,
  TriggerSource,
  createCharacter,
  createProactiveMessageBudget,
  createStoryWorld,
  createWorldEventDefinition,
} from "../../../packages/domain/src/index.ts";
import { createInMemoryRepositories } from "../../../packages/database/src/index.ts";
import { createWorkerRuntime, materializeAndEnqueue, processWorkerOccurrence, type WorkerOccurrenceTask } from "./runtime.ts";

test("worker runtime materializes and starts newly scheduled occurrences", async () => {
  const world = createStoryWorld({
    id: "runtime-world",
    name: "Runtime World",
    timezone: "UTC",
    storyMode: StoryMode.STATIC,
    relationshipDynamicsEnabled: false,
  });
  const character = createCharacter({
    id: "runtime-ai",
    displayName: "Runtime AI",
    role: CharacterRole.AI,
    storyWorldId: world.id,
    timezone: world.timezone,
  });
  const definition = createWorldEventDefinition({
    id: "runtime-event",
    storyWorld: world,
    eventKey: "runtime:event",
    name: "Runtime event",
    triggerSource: TriggerSource.MANUAL,
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-05T01:00:00.000Z" },
    targetCharacters: [character],
    createdAt: "2026-08-05T00:00:00.000Z",
  });
  const budget = createProactiveMessageBudget({
    id: "runtime-budget",
    storyWorld: world,
    character,
    windowStartsAt: "2026-08-05T00:00:00.000Z",
    windowEndsAt: "2026-08-06T00:00:00.000Z",
    limit: 2,
    consumed: 0,
    updatedAt: "2026-08-05T00:00:00.000Z",
  });
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
    proactiveMessageBudgets: [budget],
  });
  const worker = createWorkerRuntime(repositories, {
    scheduler: () => new Date("2026-08-05T00:00:00.000Z"),
    execution: () => new Date("2026-08-05T01:00:01.000Z"),
  });
  const result = await worker.runCycle({
    storyWorldId: world.id,
    window: { from: "2026-08-05T00:30:00.000Z", to: "2026-08-05T01:30:00.000Z" },
    execution: { ruleVersion: "runtime-v1", proactiveMessageUnits: 1 },
  });
  assert.equal(result.materialization.inserted.length, 1);
  assert.deepEqual(result.started.map((entry) => entry.kind), ["STARTED"]);
});

test("worker runtime enqueues deterministic occurrence jobs and processes them", async () => {
  const world = createStoryWorld({
    id: "queue-world",
    name: "Queue World",
    timezone: "UTC",
    storyMode: StoryMode.STATIC,
    relationshipDynamicsEnabled: false,
  });
  const character = createCharacter({
    id: "queue-ai",
    displayName: "Queue AI",
    role: CharacterRole.AI,
    storyWorldId: world.id,
    timezone: world.timezone,
  });
  const definition = createWorldEventDefinition({
    id: "queue-event",
    storyWorld: world,
    eventKey: "queue:event",
    name: "Queue event",
    triggerSource: TriggerSource.MANUAL,
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-05T01:00:00.000Z" },
    targetCharacters: [character],
    createdAt: "2026-08-05T00:00:00.000Z",
  });
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
  });
  const worker = createWorkerRuntime(repositories, {
    scheduler: () => new Date("2026-08-05T00:00:00.000Z"),
    execution: () => new Date("2026-08-05T01:00:01.000Z"),
  });
  const jobs: Array<{ id: string; data: WorkerOccurrenceTask }> = [];
  const queue = {
    async enqueue(id: string, data: WorkerOccurrenceTask): Promise<void> {
      jobs.push({ id, data });
    },
    async close(): Promise<void> {},
  };
  const materialized = await materializeAndEnqueue(worker, queue, {
    storyWorldId: world.id,
    window: { from: "2026-08-05T00:30:00.000Z", to: "2026-08-05T01:30:00.000Z" },
    execution: { ruleVersion: "queue-v1", proactiveMessageUnits: 0 },
  });
  assert.equal(materialized.inserted.length, 1);
  assert.deepEqual(jobs.map((job) => job.id), ["occurrence:queue-event:2026-08-05T01:00:00.000Z"]);
  assert.equal(await processWorkerOccurrence(worker, jobs[0]!.data), "STARTED");
});
