import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  EventExecutionStatus,
  EventRecurrenceKind,
  PlanInterruptibility,
  StoryMode,
  TriggerSource,
  createCharacter,
  createCharacterPlan,
  createEventExecution,
  createProactiveMessageBudget,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
} from "@living-network/domain";
import { createInMemoryRepositories } from "./index.ts";

const world = createStoryWorld({
  id: "world-life-db",
  name: "Life DB Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "life-db-character",
  displayName: "Aster",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T17:00:00.000Z";
const definition = createWorldEventDefinition({
  id: "life-db-event",
  storyWorld: world,
  eventKey: "world:life-db-event",
  name: "Life DB event",
  triggerSource: TriggerSource.WORLD_HOLIDAY,
  recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T10:00:00.000Z" },
  targetCharacters: [character],
  createdAt,
});
const occurrence = createScheduledOccurrence({
  id: "life-db-occurrence",
  definition,
  scheduledFor: "2026-08-06T10:00:00.000Z",
  occurrenceKey: "life-db-event:2026-08-06T10:00:00.000Z",
  createdAt,
});
const plan = createCharacterPlan({
  id: "life-db-plan",
  storyWorld: world,
  character,
  startsAt: "2026-08-06T09:00:00.000Z",
  endsAt: "2026-08-06T11:00:00.000Z",
  activity: "Prepare a scene",
  interruptibility: PlanInterruptibility.LIMITED,
  createdAt,
});
const budget = createProactiveMessageBudget({
  id: "life-db-budget",
  storyWorld: world,
  character,
  windowStartsAt: "2026-08-06T00:00:00.000Z",
  windowEndsAt: "2026-08-07T00:00:00.000Z",
  limit: 3,
  consumed: 1,
  updatedAt: createdAt,
});
const execution = createEventExecution({
  id: "life-db-execution",
  occurrence,
  definition,
  attempt: 1,
  ruleVersion: "rules-v1",
  inputSnapshot: { planIds: [plan.id], budgetId: budget.id },
  startedAt: "2026-08-06T10:00:01.000Z",
});

test("stores life simulation records and resolves active plans, budgets, and latest execution", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    characterPlans: [plan],
    proactiveMessageBudgets: [budget],
    eventExecutions: [execution],
  });
  assert.deepEqual(
    await repositories.characterPlans?.listActive(character.id, occurrence.scheduledFor),
    [plan],
  );
  assert.deepEqual(
    await repositories.proactiveMessageBudgets?.getActive(
      world.id,
      character.id,
      occurrence.scheduledFor,
    ),
    budget,
  );
  assert.deepEqual(
    await repositories.eventExecutions?.getLatestByOccurrence(occurrence.id),
    execution,
  );
  const snapshot = await repositories.eventExecutions?.getById(execution.id);
  assert.ok(snapshot);
  (snapshot.inputSnapshot as { planIds: string[] }).planIds.push("mutated");
  assert.deepEqual(
    (await repositories.eventExecutions?.getById(execution.id))?.inputSnapshot,
    execution.inputSnapshot,
  );
});

test("upserts plan, budget, and execution records while preserving execution identity constraints", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
  });
  assert.ok(repositories.eventExecutions);
  await repositories.characterPlans?.save(plan);
  await repositories.proactiveMessageBudgets?.save(budget);
  await repositories.eventExecutions?.save(execution);
  await repositories.eventExecutions?.save({ ...execution, status: EventExecutionStatus.RUNNING });
  await assert.rejects(
    repositories.eventExecutions.save({ ...execution, id: "different-attempt-id" }),
    { name: "TypeError", message: /Duplicate event execution attempt/ },
  );
});
