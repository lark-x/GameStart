import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  EventExecutionStatus,
  EventRecurrenceKind,
  PlanInterruptibility,
  StoryMode,
  TriggerSource,
  assertCharacterPlan,
  assertEventExecution,
  assertJsonValue,
  assertProactiveMessageBudget,
  canConsumeProactiveMessages,
  cancelEventExecution,
  completeEventExecution,
  consumeProactiveMessages,
  createCharacter,
  createCharacterPlan,
  createEventExecution,
  createProactiveMessageBudget,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
  failEventExecution,
  isBudgetActiveAt,
  isPlanActiveAt,
} from "./index.ts";

const world = createStoryWorld({
  id: "world-life-simulation",
  name: "Life Simulation Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "life-character",
  displayName: "Aster",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const createdAt = "2026-08-05T17:00:00.000Z";
const definition = createWorldEventDefinition({
  id: "life-event",
  storyWorld: world,
  eventKey: "world:life-event",
  name: "Life event",
  triggerSource: TriggerSource.WORLD_HOLIDAY,
  recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T10:00:00.000Z" },
  targetCharacters: [character],
  createdAt,
});
const occurrence = createScheduledOccurrence({
  id: "life-occurrence",
  definition,
  scheduledFor: "2026-08-06T10:00:00.000Z",
  occurrenceKey: "life-event:2026-08-06T10:00:00.000Z",
  createdAt,
});

test("creates plans and evaluates half-open activity intervals", () => {
  const plan = createCharacterPlan({
    id: "plan-morning",
    storyWorld: world,
    character,
    startsAt: "2026-08-06T09:00:00.000Z",
    endsAt: "2026-08-06T11:00:00.000Z",
    location: "Observatory",
    activity: "Prepare the festival lanterns",
    interruptibility: PlanInterruptibility.LIMITED,
    createdAt,
  });
  assert.equal(plan.timezone, world.timezone);
  assert.equal(isPlanActiveAt(plan, "2026-08-06T09:00:00.000Z"), true);
  assert.equal(isPlanActiveAt(plan, "2026-08-06T11:00:00.000Z"), false);
  assert.throws(
    () => createCharacterPlan({
      ...plan,
      storyWorld: world,
      character: createCharacter({
        id: "outsider-life",
        displayName: "Outsider",
        role: CharacterRole.AI,
        storyWorldId: "other-world",
        timezone: "UTC",
      }),
    }),
    { name: "TypeError", message: /belong to storyWorld/ },
  );
});

test("records execution snapshots and enforces terminal fields", () => {
  const execution = createEventExecution({
    id: "execution-life-1",
    occurrence,
    definition,
    ruleVersion: "rules-v1",
    inputSnapshot: {
      plans: [{ characterId: character.id, activity: "lanterns" }],
      source: "WORLD_HOLIDAY",
    },
    startedAt: "2026-08-06T10:00:01.000Z",
  });
  assert.equal(execution.status, EventExecutionStatus.RUNNING);
  const completed = completeEventExecution(
    execution,
    { action: "publish_moment", text: "The lanterns are ready." },
    "2026-08-06T10:00:05.000Z",
  );
  assert.equal(completed.status, EventExecutionStatus.COMPLETED);
  assert.deepEqual(completed.targetCharacterIds, [character.id]);
  assert.throws(
    () => failEventExecution(completed, "late", "2026-08-06T10:00:06.000Z"),
    { message: /cannot finish execution/ },
  );

  const failed = failEventExecution(
    execution,
    "budget exhausted",
    "2026-08-06T10:00:06.000Z",
  );
  assert.equal(failed.status, EventExecutionStatus.FAILED);
  const cancelled = cancelEventExecution(
    execution,
    "blocked by plan",
    "2026-08-06T10:00:07.000Z",
  );
  assert.equal(cancelled.status, EventExecutionStatus.CANCELLED);
  assert.throws(
    () => createEventExecution({
      id: "bad-execution",
      occurrence,
      definition,
      ruleVersion: "rules-v1",
      inputSnapshot: { invalid: Number.NaN },
      startedAt: "2026-08-06T10:00:01.000Z",
    }),
    { name: "TypeError", message: /finite numbers/ },
  );
});

test("enforces proactive message windows and consumption limits", () => {
  const budget = createProactiveMessageBudget({
    id: "budget-life",
    storyWorld: world,
    character,
    windowStartsAt: "2026-08-06T00:00:00.000Z",
    windowEndsAt: "2026-08-07T00:00:00.000Z",
    limit: 2,
    updatedAt: createdAt,
  });
  assert.equal(isBudgetActiveAt(budget, "2026-08-06T12:00:00.000Z"), true);
  assert.equal(isBudgetActiveAt(budget, "2026-08-07T00:00:00.000Z"), false);
  const consumed = consumeProactiveMessages(budget, 1, "2026-08-06T12:00:00.000Z");
  assert.equal(consumed.consumed, 1);
  const exhausted = consumeProactiveMessages(consumed, 1, "2026-08-06T13:00:00.000Z");
  assert.equal(exhausted.consumed, 2);
  assert.throws(
    () => consumeProactiveMessages(exhausted, 1, "2026-08-06T14:00:00.000Z"),
    { name: "RangeError", message: /budget exhausted/ },
  );
});

test("covers life-simulation validation and terminal-shape boundaries", () => {
  const plan = createCharacterPlan({
    id: "plan-boundary",
    storyWorld: world,
    character,
    startsAt: "2026-08-06T09:00:00.000Z",
    endsAt: "2026-08-06T11:00:00.000Z",
    activity: "Boundary activity",
    interruptibility: PlanInterruptibility.FLEXIBLE,
    createdAt,
  });
  assert.throws(
    () => createCharacterPlan({
      ...plan,
      startsAt: plan.endsAt,
      storyWorld: world,
      character,
    }),
    { name: "RangeError", message: /before/ },
  );
  assert.throws(
    () => assertCharacterPlan({ ...plan, endsAt: plan.startsAt }),
    { name: "RangeError", message: /before/ },
  );

  assertJsonValue({ nested: ["ok", true, null] }, "value");
  assert.throws(() => assertJsonValue(Symbol("bad"), "value"), {
    name: "TypeError",
    message: /JSON-compatible/,
  });
  let tooDeep: unknown = null;
  for (let index = 0; index < 22; index += 1) tooDeep = { child: tooDeep };
  assert.throws(() => assertJsonValue(tooDeep, "value"), {
    name: "RangeError",
    message: /nested too deeply/,
  });

  const execution = createEventExecution({
    id: "execution-boundary",
    occurrence,
    definition,
    ruleVersion: "rules-v1",
    inputSnapshot: {},
    startedAt: "2026-08-06T10:00:01.000Z",
  });
  assert.throws(
    () => createEventExecution({
      id: "execution-link-mismatch",
      occurrence: { ...occurrence, eventKey: "other:event" },
      definition,
      ruleVersion: "rules-v1",
      inputSnapshot: {},
      startedAt: "2026-08-06T10:00:01.000Z",
    }),
    { name: "TypeError", message: /do not match/ },
  );
  assert.throws(
    () => createEventExecution({
      id: "execution-bad-attempt",
      occurrence,
      definition,
      attempt: 0,
      ruleVersion: "rules-v1",
      inputSnapshot: {},
      startedAt: "2026-08-06T10:00:01.000Z",
    }),
    { name: "RangeError", message: /attempt/ },
  );
  assert.throws(() => assertEventExecution({ ...execution, finishedAt: createdAt }), {
    name: "TypeError",
    message: /RUNNING execution cannot/,
  });
  assert.throws(() => assertEventExecution({
    ...execution,
    status: EventExecutionStatus.COMPLETED,
    finishedAt: createdAt,
  }), { name: "TypeError", message: /outputSnapshot/ });
  assert.throws(() => assertEventExecution({
    ...execution,
    status: EventExecutionStatus.FAILED,
    finishedAt: createdAt,
  }), { name: "TypeError", message: /failureReason/ });
  assert.throws(() => assertEventExecution({ ...execution, attempt: 0 }), {
    name: "RangeError",
    message: /attempt/,
  });

  const budget = createProactiveMessageBudget({
    id: "budget-boundary",
    storyWorld: world,
    character,
    windowStartsAt: "2026-08-06T00:00:00.000Z",
    windowEndsAt: "2026-08-07T00:00:00.000Z",
    limit: 1,
    updatedAt: createdAt,
  });
  assert.equal(canConsumeProactiveMessages(budget, 1), true);
  assert.equal(canConsumeProactiveMessages(budget, 2), false);
  assert.throws(() => canConsumeProactiveMessages(budget, 0), { name: "RangeError", message: /positive/ });
  assert.throws(() => createProactiveMessageBudget({
    id: "budget-bad-limit",
    storyWorld: world,
    character,
    windowStartsAt: "2026-08-06T00:00:00.000Z",
    windowEndsAt: "2026-08-07T00:00:00.000Z",
    limit: -1,
    updatedAt: createdAt,
  }), { name: "RangeError", message: /limit/ });
  assert.throws(() => createProactiveMessageBudget({
    id: "budget-bad-consumed",
    storyWorld: world,
    character,
    windowStartsAt: "2026-08-06T00:00:00.000Z",
    windowEndsAt: "2026-08-07T00:00:00.000Z",
    limit: 1,
    consumed: 2,
    updatedAt: createdAt,
  }), { name: "RangeError", message: /consumed/ });
  assert.throws(() => assertProactiveMessageBudget({ ...budget, limit: -1 }), {
    name: "RangeError",
    message: /limit/,
  });
  assert.throws(() => assertProactiveMessageBudget({ ...budget, consumed: 2 }), {
    name: "RangeError",
    message: /consumed/,
  });
});
