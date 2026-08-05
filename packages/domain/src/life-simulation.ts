import type { Character } from "./character.ts";
import type { ScheduledOccurrence, WorldEventDefinition } from "./event.ts";
import type { StoryWorld } from "./story-world.ts";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
  assertTimezone,
} from "./validation.ts";

export const PlanInterruptibility = {
  BLOCKED: "BLOCKED",
  LIMITED: "LIMITED",
  FLEXIBLE: "FLEXIBLE",
} as const;

export type PlanInterruptibility =
  (typeof PlanInterruptibility)[keyof typeof PlanInterruptibility];

export interface CharacterPlan {
  id: string;
  storyWorldId: string;
  characterId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location?: string;
  activity: string;
  interruptibility: PlanInterruptibility;
  createdAt: string;
}

export interface CharacterPlanInput {
  id: string;
  storyWorld: StoryWorld;
  character: Character;
  startsAt: string;
  endsAt: string;
  timezone?: string;
  location?: string;
  activity: string;
  interruptibility: PlanInterruptibility;
  createdAt: string;
}

export const EventExecutionStatus = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type EventExecutionStatus =
  (typeof EventExecutionStatus)[keyof typeof EventExecutionStatus];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export interface EventExecution {
  id: string;
  occurrenceId: string;
  definitionId: string;
  storyWorldId: string;
  eventKey: string;
  targetCharacterIds: readonly string[];
  attempt: number;
  ruleVersion: string;
  inputSnapshot: JsonObject;
  status: EventExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  outputSnapshot?: JsonObject;
  failureReason?: string;
}

export interface EventExecutionInput {
  id: string;
  occurrence: ScheduledOccurrence;
  definition: WorldEventDefinition;
  attempt?: number;
  ruleVersion: string;
  inputSnapshot: JsonObject;
  startedAt: string;
}

export interface ProactiveMessageBudget {
  id: string;
  storyWorldId: string;
  characterId: string;
  windowStartsAt: string;
  windowEndsAt: string;
  limit: number;
  consumed: number;
  updatedAt: string;
}

export interface ProactiveMessageBudgetInput {
  id: string;
  storyWorld: StoryWorld;
  character: Character;
  windowStartsAt: string;
  windowEndsAt: string;
  limit: number;
  consumed?: number;
  updatedAt: string;
}

function assertEnum<T extends string>(value: T, values: readonly T[], field: string): void {
  if (!values.includes(value)) throw new TypeError(`${field} has an unsupported value`);
}

function assertTimeRange(startsAt: string, endsAt: string, field: string): void {
  assertIsoTimestamp(startsAt, `${field}.startsAt`);
  assertIsoTimestamp(endsAt, `${field}.endsAt`);
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    throw new RangeError(`${field}.startsAt must be before ${field}.endsAt`);
  }
}

function assertCharacterInWorld(
  character: Character,
  storyWorld: StoryWorld,
  field: string,
): void {
  if (character.storyWorldId !== storyWorld.id) {
    throw new TypeError(`${field} must belong to storyWorld`);
  }
}

export function createCharacterPlan(input: CharacterPlanInput): CharacterPlan {
  assertNonEmptyString(input.id, "plan.id");
  assertNonEmptyString(input.storyWorld.id, "plan.storyWorld.id");
  assertCharacterInWorld(input.character, input.storyWorld, "plan.character");
  assertTimeRange(input.startsAt, input.endsAt, "plan");
  assertNonEmptyString(input.activity, "plan.activity");
  if (input.location !== undefined) assertNonEmptyString(input.location, "plan.location");
  assertEnum(
    input.interruptibility,
    Object.values(PlanInterruptibility),
    "plan.interruptibility",
  );
  assertIsoTimestamp(input.createdAt, "plan.createdAt");
  const timezone = input.timezone ?? input.storyWorld.timezone;
  assertTimezone(timezone, "plan.timezone");

  const plan: CharacterPlan = {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    characterId: input.character.id,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone,
    activity: input.activity,
    interruptibility: input.interruptibility,
    createdAt: input.createdAt,
  };
  if (input.location !== undefined) plan.location = input.location;
  assertCharacterPlan(plan);
  return plan;
}

export function assertCharacterPlan(plan: CharacterPlan): void {
  assertNonEmptyString(plan.id, "plan.id");
  assertNonEmptyString(plan.storyWorldId, "plan.storyWorldId");
  assertNonEmptyString(plan.characterId, "plan.characterId");
  assertTimeRange(plan.startsAt, plan.endsAt, "plan");
  assertTimezone(plan.timezone, "plan.timezone");
  assertNonEmptyString(plan.activity, "plan.activity");
  if (plan.location !== undefined) assertNonEmptyString(plan.location, "plan.location");
  assertEnum(
    plan.interruptibility,
    Object.values(PlanInterruptibility),
    "plan.interruptibility",
  );
  assertIsoTimestamp(plan.createdAt, "plan.createdAt");
}

export function isPlanActiveAt(plan: CharacterPlan, at: string): boolean {
  assertCharacterPlan(plan);
  assertIsoTimestamp(at, "plan.at");
  const timestamp = Date.parse(at);
  return timestamp >= Date.parse(plan.startsAt) && timestamp < Date.parse(plan.endsAt);
}

export function assertJsonValue(value: unknown, field: string, depth = 0): asserts value is JsonValue {
  if (depth > 20) throw new RangeError(`${field} is nested too deeply`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${field} must contain finite numbers`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${field}[${index}]`, depth + 1));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertNonEmptyString(key, `${field}.key`);
      assertJsonValue(item, `${field}.${key}`, depth + 1);
    }
    return;
  }
  throw new TypeError(`${field} must be JSON-compatible`);
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (value !== null && typeof value === "object") {
    const clone: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) clone[key] = cloneJsonValue(item);
    return clone;
  }
  return value;
}

export function cloneJsonObject(value: JsonObject): JsonObject {
  return cloneJsonValue(value) as JsonObject;
}

function assertTargetIds(characterIds: readonly string[], field: string): void {
  const seen = new Set<string>();
  for (const characterId of characterIds) {
    assertNonEmptyString(characterId, field);
    if (seen.has(characterId)) throw new TypeError(`${field} contains duplicate character`);
    seen.add(characterId);
  }
}

function assertExecutionLink(
  occurrence: ScheduledOccurrence,
  definition: WorldEventDefinition,
): void {
  if (
    occurrence.definitionId !== definition.id ||
    occurrence.storyWorldId !== definition.storyWorldId ||
    occurrence.eventKey !== definition.eventKey ||
    occurrence.timezone !== definition.timezone
  ) {
    throw new TypeError("event execution occurrence and definition do not match");
  }
}

export function createEventExecution(input: EventExecutionInput): EventExecution {
  assertNonEmptyString(input.id, "execution.id");
  assertNonEmptyString(input.ruleVersion, "execution.ruleVersion");
  assertIsoTimestamp(input.startedAt, "execution.startedAt");
  assertScheduledOccurrenceLike(input.occurrence);
  assertWorldEventDefinitionLike(input.definition);
  assertExecutionLink(input.occurrence, input.definition);
  assertJsonValue(input.inputSnapshot, "execution.inputSnapshot");
  const attempt = input.attempt ?? 1;
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new RangeError("execution.attempt must be a positive integer");
  }

  const execution: EventExecution = {
    id: input.id,
    occurrenceId: input.occurrence.id,
    definitionId: input.definition.id,
    storyWorldId: input.definition.storyWorldId,
    eventKey: input.definition.eventKey,
    targetCharacterIds: [...input.definition.targetCharacterIds],
    attempt,
    ruleVersion: input.ruleVersion,
    inputSnapshot: cloneJsonObject(input.inputSnapshot),
    status: EventExecutionStatus.RUNNING,
    startedAt: input.startedAt,
  };
  assertEventExecution(execution);
  return execution;
}

function assertScheduledOccurrenceLike(occurrence: ScheduledOccurrence): void {
  assertNonEmptyString(occurrence.id, "execution.occurrence.id");
  assertNonEmptyString(occurrence.definitionId, "execution.occurrence.definitionId");
  assertNonEmptyString(occurrence.storyWorldId, "execution.occurrence.storyWorldId");
  assertNonEmptyString(occurrence.eventKey, "execution.occurrence.eventKey");
  assertTimezone(occurrence.timezone, "execution.occurrence.timezone");
}

function assertWorldEventDefinitionLike(definition: WorldEventDefinition): void {
  assertNonEmptyString(definition.id, "execution.definition.id");
  assertNonEmptyString(definition.storyWorldId, "execution.definition.storyWorldId");
  assertNonEmptyString(definition.eventKey, "execution.definition.eventKey");
  assertTimezone(definition.timezone, "execution.definition.timezone");
  assertTargetIds(definition.targetCharacterIds, "execution.targetCharacterIds");
}

export function assertEventExecution(execution: EventExecution): void {
  assertNonEmptyString(execution.id, "execution.id");
  assertNonEmptyString(execution.occurrenceId, "execution.occurrenceId");
  assertNonEmptyString(execution.definitionId, "execution.definitionId");
  assertNonEmptyString(execution.storyWorldId, "execution.storyWorldId");
  assertNonEmptyString(execution.eventKey, "execution.eventKey");
  assertTargetIds(execution.targetCharacterIds, "execution.targetCharacterIds");
  if (!Number.isSafeInteger(execution.attempt) || execution.attempt < 1) {
    throw new RangeError("execution.attempt must be a positive integer");
  }
  assertNonEmptyString(execution.ruleVersion, "execution.ruleVersion");
  assertJsonValue(execution.inputSnapshot, "execution.inputSnapshot");
  assertEnum(execution.status, Object.values(EventExecutionStatus), "execution.status");
  assertIsoTimestamp(execution.startedAt, "execution.startedAt");
  if (execution.finishedAt !== undefined) assertIsoTimestamp(execution.finishedAt, "execution.finishedAt");
  if (execution.outputSnapshot !== undefined) assertJsonValue(execution.outputSnapshot, "execution.outputSnapshot");
  if (execution.failureReason !== undefined) assertNonEmptyString(execution.failureReason, "execution.failureReason");

  if (execution.status === EventExecutionStatus.RUNNING) {
    if (execution.finishedAt !== undefined || execution.outputSnapshot !== undefined || execution.failureReason !== undefined) {
      throw new TypeError("RUNNING execution cannot have terminal fields");
    }
  } else if (execution.finishedAt === undefined) {
    throw new TypeError(`${execution.status} execution requires finishedAt`);
  }
  if (execution.status === EventExecutionStatus.COMPLETED && execution.outputSnapshot === undefined) {
    throw new TypeError("COMPLETED execution requires outputSnapshot");
  }
  if (
    (execution.status === EventExecutionStatus.FAILED || execution.status === EventExecutionStatus.CANCELLED) &&
    execution.failureReason === undefined
  ) {
    throw new TypeError(`${execution.status} execution requires failureReason`);
  }
}

function finishExecution(
  execution: EventExecution,
  finishedAt: string,
): EventExecution {
  assertEventExecution(execution);
  assertIsoTimestamp(finishedAt, "execution.finishedAt");
  if (execution.status !== EventExecutionStatus.RUNNING) {
    throw new Error(`cannot finish execution from ${execution.status}`);
  }
  return { ...execution, finishedAt };
}

export function completeEventExecution(
  execution: EventExecution,
  outputSnapshot: JsonObject,
  finishedAt: string,
): EventExecution {
  const next = finishExecution(execution, finishedAt);
  assertJsonValue(outputSnapshot, "execution.outputSnapshot");
  const completed: EventExecution = {
    ...next,
    status: EventExecutionStatus.COMPLETED,
    outputSnapshot: cloneJsonObject(outputSnapshot),
  };
  assertEventExecution(completed);
  return completed;
}

export function failEventExecution(
  execution: EventExecution,
  failureReason: string,
  finishedAt: string,
): EventExecution {
  const next = finishExecution(execution, finishedAt);
  assertNonEmptyString(failureReason, "execution.failureReason");
  const failed: EventExecution = {
    ...next,
    status: EventExecutionStatus.FAILED,
    failureReason,
  };
  assertEventExecution(failed);
  return failed;
}

export function cancelEventExecution(
  execution: EventExecution,
  reason: string,
  finishedAt: string,
): EventExecution {
  const next = finishExecution(execution, finishedAt);
  assertNonEmptyString(reason, "execution.failureReason");
  const cancelled: EventExecution = {
    ...next,
    status: EventExecutionStatus.CANCELLED,
    failureReason: reason,
  };
  assertEventExecution(cancelled);
  return cancelled;
}

export function createProactiveMessageBudget(
  input: ProactiveMessageBudgetInput,
): ProactiveMessageBudget {
  assertNonEmptyString(input.id, "budget.id");
  assertNonEmptyString(input.storyWorld.id, "budget.storyWorld.id");
  assertCharacterInWorld(input.character, input.storyWorld, "budget.character");
  assertTimeRange(input.windowStartsAt, input.windowEndsAt, "budget.window");
  assertIsoTimestamp(input.updatedAt, "budget.updatedAt");
  if (!Number.isSafeInteger(input.limit) || input.limit < 0) {
    throw new RangeError("budget.limit must be a non-negative integer");
  }
  const consumed = input.consumed ?? 0;
  if (!Number.isSafeInteger(consumed) || consumed < 0 || consumed > input.limit) {
    throw new RangeError("budget.consumed must be between 0 and limit");
  }
  return {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    characterId: input.character.id,
    windowStartsAt: input.windowStartsAt,
    windowEndsAt: input.windowEndsAt,
    limit: input.limit,
    consumed,
    updatedAt: input.updatedAt,
  };
}

export function assertProactiveMessageBudget(budget: ProactiveMessageBudget): void {
  assertNonEmptyString(budget.id, "budget.id");
  assertNonEmptyString(budget.storyWorldId, "budget.storyWorldId");
  assertNonEmptyString(budget.characterId, "budget.characterId");
  assertTimeRange(budget.windowStartsAt, budget.windowEndsAt, "budget.window");
  assertIsoTimestamp(budget.updatedAt, "budget.updatedAt");
  if (!Number.isSafeInteger(budget.limit) || budget.limit < 0) {
    throw new RangeError("budget.limit must be a non-negative integer");
  }
  if (!Number.isSafeInteger(budget.consumed) || budget.consumed < 0 || budget.consumed > budget.limit) {
    throw new RangeError("budget.consumed must be between 0 and limit");
  }
}

export function isBudgetActiveAt(budget: ProactiveMessageBudget, at: string): boolean {
  assertProactiveMessageBudget(budget);
  assertIsoTimestamp(at, "budget.at");
  const timestamp = Date.parse(at);
  return timestamp >= Date.parse(budget.windowStartsAt) && timestamp < Date.parse(budget.windowEndsAt);
}

export function canConsumeProactiveMessages(
  budget: ProactiveMessageBudget,
  units: number,
): boolean {
  assertProactiveMessageBudget(budget);
  if (!Number.isSafeInteger(units) || units < 1) {
    throw new RangeError("budget units must be a positive integer");
  }
  return budget.consumed + units <= budget.limit;
}

export function consumeProactiveMessages(
  budget: ProactiveMessageBudget,
  units: number,
  updatedAt: string,
): ProactiveMessageBudget {
  assertProactiveMessageBudget(budget);
  assertIsoTimestamp(updatedAt, "budget.updatedAt");
  if (!canConsumeProactiveMessages(budget, units)) {
    throw new RangeError("proactive message budget exhausted");
  }
  return { ...budget, consumed: budget.consumed + units, updatedAt };
}
