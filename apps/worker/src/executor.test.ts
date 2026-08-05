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
  cancelEventExecution,
  completeEventExecution,
  createEventExecution,
  createProactiveMessageBudget,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
} from "../../../packages/domain/src/index.ts";
import { createInMemoryRepositories } from "../../../packages/database/src/index.ts";
import {
  ExecutionStartResultKind,
  createEventExecutionCoordinator,
} from "./index.ts";

const world = createStoryWorld({
  id: "world-executor",
  name: "Executor Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "executor-character",
  displayName: "Aster",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = new Date("2026-08-01T00:00:00.000Z");

function createFixture(suffix: string, interruptibility: PlanInterruptibility, consumed = 0) {
  const definition = createWorldEventDefinition({
    id: `executor-definition-${suffix}`,
    storyWorld: world,
    eventKey: `world:executor-${suffix}`,
    name: `Executor ${suffix}`,
    triggerSource: TriggerSource.WORLD_HOLIDAY,
    recurrence: {
      kind: EventRecurrenceKind.ONCE,
      runAt: "2026-08-15T10:00:00.000Z",
    },
    targetCharacters: [character],
    createdAt: createdAt.toISOString(),
  });
  const occurrence = createScheduledOccurrence({
    id: `executor-occurrence-${suffix}`,
    definition,
    scheduledFor: "2026-08-15T10:00:00.000Z",
    occurrenceKey: `executor-${suffix}:2026-08-15T10:00:00.000Z`,
    createdAt: createdAt.toISOString(),
  });
  const plan = createCharacterPlan({
    id: `executor-plan-${suffix}`,
    storyWorld: world,
    character,
    startsAt: "2026-08-15T09:00:00.000Z",
    endsAt: "2026-08-15T11:00:00.000Z",
    activity: `Activity ${suffix}`,
    interruptibility,
    createdAt: createdAt.toISOString(),
  });
  const budget = createProactiveMessageBudget({
    id: `executor-budget-${suffix}`,
    storyWorld: world,
    character,
    windowStartsAt: "2026-08-15T00:00:00.000Z",
    windowEndsAt: "2026-08-16T00:00:00.000Z",
    limit: 1,
    consumed,
    updatedAt: createdAt.toISOString(),
  });
  return { definition, occurrence, plan, budget };
}

test("starts a runnable occurrence, consumes one budget unit, and is replay-safe", async () => {
  const fixture = createFixture("start", PlanInterruptibility.LIMITED);
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [fixture.definition],
    scheduledOccurrences: [fixture.occurrence],
    characterPlans: [fixture.plan],
    proactiveMessageBudgets: [fixture.budget],
  });
  assert.ok(repositories.proactiveMessageBudgets);
  const coordinator = createEventExecutionCoordinator(repositories, () => createdAt);
  const first = await coordinator.start(fixture.occurrence.id, {
    ruleVersion: "rules-v1",
    inputSnapshot: { request: "test" },
  });
  assert.equal(first.kind, ExecutionStartResultKind.STARTED);
  assert.equal(first.occurrence.status, "RUNNING");
  assert.equal(first.execution.status, EventExecutionStatus.RUNNING);
  assert.equal(
    (await repositories.proactiveMessageBudgets.getActive(
      world.id,
      character.id,
      fixture.occurrence.scheduledFor,
    ))?.consumed,
    1,
  );

  const replay = await coordinator.start(fixture.occurrence.id, { ruleVersion: "rules-v1" });
  assert.equal(replay.kind, ExecutionStartResultKind.STARTED);
  assert.equal(replay.execution.id, first.execution.id);
  assert.equal(
    (await repositories.proactiveMessageBudgets.getActive(
      world.id,
      character.id,
      fixture.occurrence.scheduledFor,
    ))?.consumed,
    1,
  );
});

test("cancels and audits occurrences blocked by a character plan or exhausted budget", async () => {
  const blocked = createFixture("blocked", PlanInterruptibility.BLOCKED);
  const exhausted = createFixture("exhausted", PlanInterruptibility.LIMITED, 1);
  const exhaustedOccurrence = {
    ...exhausted.occurrence,
    scheduledFor: "2026-08-15T12:00:00.000Z",
  };
  const blockedBudget = {
    ...blocked.budget,
    windowStartsAt: "2026-08-15T00:00:00.000Z",
    windowEndsAt: "2026-08-15T09:00:00.000Z",
  };
  const exhaustedPlan = {
    ...exhausted.plan,
    startsAt: "2026-08-15T07:00:00.000Z",
    endsAt: "2026-08-15T08:00:00.000Z",
  };
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [blocked.definition, exhausted.definition],
    scheduledOccurrences: [blocked.occurrence, exhaustedOccurrence],
    characterPlans: [blocked.plan, exhaustedPlan],
    proactiveMessageBudgets: [blockedBudget, exhausted.budget],
  });
  const coordinator = createEventExecutionCoordinator(repositories, () => createdAt);
  const blockedResult = await coordinator.start(blocked.occurrence.id, {
    ruleVersion: "rules-v1",
  });
  assert.equal(blockedResult.kind, ExecutionStartResultKind.CANCELLED);
  assert.equal(blockedResult.occurrence.status, "CANCELLED");
  assert.equal(blockedResult.execution.status, EventExecutionStatus.CANCELLED);
  assert.match(blockedResult.execution.failureReason ?? "", /blocked by character plan/);

  const exhaustedResult = await coordinator.start(exhaustedOccurrence.id, {
    ruleVersion: "rules-v1",
  });
  assert.equal(exhaustedResult.kind, ExecutionStartResultKind.CANCELLED);
  assert.equal(exhaustedResult.execution.status, EventExecutionStatus.CANCELLED);
  assert.match(exhaustedResult.execution.failureReason ?? "", /budget exhausted/);
});

test("requires every execution repository before constructing the coordinator", () => {
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [character] });
  const incomplete = {
    storyWorlds: repositories.storyWorlds,
    characters: repositories.characters,
    relationshipEdges: repositories.relationshipEdges,
    actorSessions: repositories.actorSessions,
  };
  assert.throws(() => createEventExecutionCoordinator(incomplete), {
    name: "TypeError",
    message: /repositories are not configured/,
  });
});

test("rejects unknown definitions, invalid inputs, and already finished occurrences", async () => {
  const fixture = createFixture("edge", PlanInterruptibility.LIMITED);
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [fixture.definition],
    scheduledOccurrences: [fixture.occurrence],
    characterPlans: [fixture.plan],
    proactiveMessageBudgets: [fixture.budget],
  });
  const coordinator = createEventExecutionCoordinator(repositories, () => createdAt);
  await assert.rejects(coordinator.start("missing", { ruleVersion: "rules-v1" }), /Unknown scheduled occurrence/);
  const noDefinition = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [fixture.definition],
    scheduledOccurrences: [fixture.occurrence],
    characterPlans: [fixture.plan],
    proactiveMessageBudgets: [fixture.budget],
  });
  assert.ok(noDefinition.worldEventDefinitions);
  noDefinition.worldEventDefinitions.getById = async () => undefined;
  await assert.rejects(createEventExecutionCoordinator(noDefinition, () => createdAt).start(fixture.occurrence.id, { ruleVersion: "rules-v1" }), /Unknown event definition/);
  await assert.rejects(coordinator.start(fixture.occurrence.id, { ruleVersion: "rules-v1", proactiveMessageUnits: -1 }), /proactiveMessageUnits/);
  await assert.rejects(coordinator.start(fixture.occurrence.id, { ruleVersion: " " }), /ruleVersion/);

  const completed = completeEventExecution(
    createEventExecutionForFixture(fixture),
    { done: true },
    createdAt.toISOString(),
  );
  const completedRepositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [fixture.definition],
    scheduledOccurrences: [fixture.occurrence],
    eventExecutions: [completed],
    characterPlans: [fixture.plan],
    proactiveMessageBudgets: [fixture.budget],
  });
  const already = await createEventExecutionCoordinator(completedRepositories, () => createdAt).start(fixture.occurrence.id, { ruleVersion: "rules-v1" });
  assert.equal(already.kind, ExecutionStartResultKind.ALREADY_FINISHED);

  const cancelled = cancelEventExecution(
    createEventExecutionForFixture({ ...fixture, occurrence: fixture.occurrence }),
    "cancelled",
    createdAt.toISOString(),
  );
  const cancelledRepositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [fixture.definition],
    scheduledOccurrences: [fixture.occurrence],
    eventExecutions: [cancelled],
    characterPlans: [fixture.plan],
    proactiveMessageBudgets: [fixture.budget],
  });
  const cancelledResult = await createEventExecutionCoordinator(cancelledRepositories, () => createdAt).start(fixture.occurrence.id, { ruleVersion: "rules-v1" });
  assert.equal(cancelledResult.kind, ExecutionStartResultKind.ALREADY_FINISHED);

  const notRunnable = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [fixture.definition],
    scheduledOccurrences: [{ ...fixture.occurrence, status: "CANCELLED" }],
    characterPlans: [fixture.plan],
    proactiveMessageBudgets: [fixture.budget],
  });
  await assert.rejects(createEventExecutionCoordinator(notRunnable, () => createdAt).start(fixture.occurrence.id, { ruleVersion: "rules-v1" }), /not runnable/);
});

function createEventExecutionForFixture(value: ReturnType<typeof createFixture>) {
  return (createEventExecution as unknown as (input: any) => any)({
    id: `execution-${value.occurrence.id}`,
    occurrence: value.occurrence,
    definition: value.definition,
    ruleVersion: "rules-v1",
    inputSnapshot: {},
    startedAt: createdAt.toISOString(),
  });
}

test("returns FAILED when budget persistence fails", async () => {
  const fixture = createFixture("persistence-failure", PlanInterruptibility.LIMITED);
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [fixture.definition],
    scheduledOccurrences: [fixture.occurrence],
    characterPlans: [fixture.plan],
    proactiveMessageBudgets: [fixture.budget],
  });
  assert.ok(repositories.proactiveMessageBudgets);
  repositories.proactiveMessageBudgets.save = async () => { throw new Error("budget persistence failed"); };
  const result = await createEventExecutionCoordinator(repositories, () => createdAt).start(fixture.occurrence.id, { ruleVersion: "rules-v1" });
  assert.equal(result.kind, ExecutionStartResultKind.FAILED);
  assert.match(result.execution.failureReason ?? "", /budget persistence failed/);
});
