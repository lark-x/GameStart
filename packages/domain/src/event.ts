import type { Character } from "./character.ts";
import type { StoryWorld } from "./story-world.ts";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
  assertTimezone,
} from "./validation.ts";

export const TriggerSource = {
  BIRTHDAY: "BIRTHDAY",
  REAL_HOLIDAY: "REAL_HOLIDAY",
  WORLD_HOLIDAY: "WORLD_HOLIDAY",
  STORY_NODE: "STORY_NODE",
  USER_INTERACTION: "USER_INTERACTION",
  RELATIONSHIP_EVENT: "RELATIONSHIP_EVENT",
  MANUAL: "MANUAL",
} as const;

export type TriggerSource = (typeof TriggerSource)[keyof typeof TriggerSource];

export const EventRecurrenceKind = {
  ONCE: "ONCE",
  ANNUAL: "ANNUAL",
} as const;

export type EventRecurrenceKind =
  (typeof EventRecurrenceKind)[keyof typeof EventRecurrenceKind];

export interface OnceEventRecurrence {
  kind: typeof EventRecurrenceKind.ONCE;
  runAt: string;
}

export interface AnnualEventRecurrence {
  kind: typeof EventRecurrenceKind.ANNUAL;
  month: number;
  day: number;
  localTime: string;
}

export type EventRecurrence = OnceEventRecurrence | AnnualEventRecurrence;

export interface EventOutputPolicy {
  sendMessage: boolean;
  publishMoment: boolean;
  generateImage: boolean;
}

export const defaultEventOutputPolicy = (): EventOutputPolicy => ({
  // Existing calendar entries were scheduling-only. Keep that behavior until
  // an administrator explicitly enables one of the new delivery outputs.
  sendMessage: false,
  publishMoment: false,
  generateImage: false,
});

export interface WorldEventDefinition {
  id: string;
  storyWorldId: string;
  eventKey: string;
  name: string;
  triggerSource: TriggerSource;
  timezone: string;
  recurrence: EventRecurrence;
  targetCharacterIds: readonly string[];
  recipientCharacterIds: readonly string[];
  outputs: EventOutputPolicy;
  priority: number;
  cooldownSeconds?: number;
  enabled: boolean;
  createdAt: string;
}

export interface WorldEventDefinitionInput {
  id: string;
  storyWorld: StoryWorld;
  eventKey: string;
  name: string;
  triggerSource: TriggerSource;
  timezone?: string;
  recurrence: EventRecurrence;
  targetCharacters?: readonly Character[];
  recipientCharacters?: readonly Character[];
  outputs?: Partial<EventOutputPolicy>;
  priority?: number;
  cooldownSeconds?: number;
  enabled?: boolean;
  createdAt: string;
}

export const ScheduledOccurrenceStatus = {
  PENDING: "PENDING",
  ENQUEUED: "ENQUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type ScheduledOccurrenceStatus =
  (typeof ScheduledOccurrenceStatus)[keyof typeof ScheduledOccurrenceStatus];

export interface ScheduledOccurrence {
  id: string;
  definitionId: string;
  storyWorldId: string;
  eventKey: string;
  scheduledFor: string;
  timezone: string;
  occurrenceKey: string;
  status: ScheduledOccurrenceStatus;
  createdAt: string;
}

export interface ScheduledOccurrenceInput {
  id: string;
  definition: WorldEventDefinition;
  scheduledFor: string;
  occurrenceKey: string;
  createdAt: string;
  status?: ScheduledOccurrenceStatus;
}

function assertEnum<T extends string>(value: T, values: readonly T[], field: string): void {
  if (!values.includes(value)) throw new TypeError(`${field} has an unsupported value`);
}

function assertLocalTime(value: unknown, field: string): asserts value is string {
  assertNonEmptyString(value, field);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new TypeError(`${field} must use HH:mm format`);
  }
}

function assertAnnualCalendarDate(month: unknown, day: unknown, field: string): void {
  if (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`${field}.month must be an integer between 1 and 12`);
  }
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError(`${field}.day must be an integer between 1 and 31`);
  }

  // 2000 is a leap year, so this accepts the only valid annual date that is
  // not valid in every year (February 29) without rejecting it prematurely.
  const parsed = new Date(Date.UTC(2000, month - 1, day));
  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new RangeError(`${field} must be a valid calendar date`);
  }
}

function assertRecurrence(recurrence: EventRecurrence, field: string): void {
  if (recurrence === null || typeof recurrence !== "object") {
    throw new TypeError(`${field} must be an event recurrence`);
  }
  assertEnum(recurrence.kind, Object.values(EventRecurrenceKind), `${field}.kind`);
  if (recurrence.kind === EventRecurrenceKind.ONCE) {
    assertIsoTimestamp(recurrence.runAt, `${field}.runAt`);
    return;
  }
  assertAnnualCalendarDate(recurrence.month, recurrence.day, field);
  assertLocalTime(recurrence.localTime, `${field}.localTime`);
}

function assertTargetCharacterIds(
  characterIds: readonly string[],
  storyWorldId: string,
  field: string,
): void {
  const seen = new Set<string>();
  for (const characterId of characterIds) {
    assertNonEmptyString(characterId, field);
    if (seen.has(characterId)) throw new TypeError(`${field} contains duplicate character`);
    seen.add(characterId);
  }
  assertNonEmptyString(storyWorldId, "event.storyWorldId");
}

function assertTargetCharacters(
  characters: readonly Character[],
  storyWorldId: string,
  field: string,
): void {
  const seen = new Set<string>();
  for (const character of characters) {
    if (seen.has(character.id)) throw new TypeError(`${field} contains duplicate character`);
    seen.add(character.id);
    if (character.storyWorldId !== storyWorldId) {
      throw new TypeError(`${field} must belong to storyWorld`);
    }
  }
}

function assertOutputPolicy(outputs: EventOutputPolicy, field: string): void {
  for (const key of ["sendMessage", "publishMoment", "generateImage"] as const) {
    if (typeof outputs[key] !== "boolean") throw new TypeError(`${field}.${key} must be a boolean`);
  }
}

function hasAnyOutput(outputs: EventOutputPolicy): boolean {
  return outputs.sendMessage || outputs.publishMoment || outputs.generateImage;
}

export function createWorldEventDefinition(
  input: WorldEventDefinitionInput,
): WorldEventDefinition {
  assertNonEmptyString(input.id, "event.id");
  assertNonEmptyString(input.eventKey, "event.eventKey");
  assertNonEmptyString(input.name, "event.name");
  assertNonEmptyString(input.storyWorld.id, "event.storyWorld.id");
  assertIsoTimestamp(input.createdAt, "event.createdAt");
  assertEnum(input.triggerSource, Object.values(TriggerSource), "event.triggerSource");
  assertRecurrence(input.recurrence, "event.recurrence");

  const timezone = input.timezone ?? input.storyWorld.timezone;
  assertTimezone(timezone, "event.timezone");

  const targetCharacters = input.targetCharacters ?? [];
  assertTargetCharacters(targetCharacters, input.storyWorld.id, "event.targetCharacters");
  const recipientCharacters = input.recipientCharacters ?? targetCharacters;
  assertTargetCharacters(recipientCharacters, input.storyWorld.id, "event.recipientCharacters");
  const outputs: EventOutputPolicy = { ...defaultEventOutputPolicy(), ...input.outputs };
  assertOutputPolicy(outputs, "event.outputs");
  if (hasAnyOutput(outputs) && recipientCharacters.length === 0) {
    throw new TypeError("event.recipientCharacters must not be empty when an output is enabled");
  }

  const priority = input.priority ?? 0;
  if (!Number.isInteger(priority) || priority < 0) {
    throw new RangeError("event.priority must be a non-negative integer");
  }
  if (
    input.cooldownSeconds !== undefined &&
    (!Number.isInteger(input.cooldownSeconds) || input.cooldownSeconds < 0)
  ) {
    throw new RangeError("event.cooldownSeconds must be a non-negative integer");
  }

  const definition: WorldEventDefinition = {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    eventKey: input.eventKey,
    name: input.name,
    triggerSource: input.triggerSource,
    timezone,
    recurrence: input.recurrence.kind === EventRecurrenceKind.ONCE
      ? { kind: input.recurrence.kind, runAt: input.recurrence.runAt }
      : {
          kind: input.recurrence.kind,
          month: input.recurrence.month,
          day: input.recurrence.day,
          localTime: input.recurrence.localTime,
        },
    targetCharacterIds: targetCharacters.map((character) => character.id),
    recipientCharacterIds: recipientCharacters.map((character) => character.id),
    outputs,
    priority,
    enabled: input.enabled ?? true,
    createdAt: input.createdAt,
  };
  if (input.cooldownSeconds !== undefined) definition.cooldownSeconds = input.cooldownSeconds;
  assertWorldEventDefinition(definition);
  return definition;
}

export function assertWorldEventDefinition(definition: WorldEventDefinition): void {
  assertNonEmptyString(definition.id, "event.id");
  assertNonEmptyString(definition.storyWorldId, "event.storyWorldId");
  assertNonEmptyString(definition.eventKey, "event.eventKey");
  assertNonEmptyString(definition.name, "event.name");
  assertTimezone(definition.timezone, "event.timezone");
  assertEnum(definition.triggerSource, Object.values(TriggerSource), "event.triggerSource");
  assertRecurrence(definition.recurrence, "event.recurrence");
  assertTargetCharacterIds(definition.targetCharacterIds, definition.storyWorldId, "event.targetCharacterIds");
  assertTargetCharacterIds(definition.recipientCharacterIds, definition.storyWorldId, "event.recipientCharacterIds");
  assertOutputPolicy(definition.outputs, "event.outputs");
  if (hasAnyOutput(definition.outputs) && definition.recipientCharacterIds.length === 0) {
    throw new TypeError("event.recipientCharacterIds must not be empty when an output is enabled");
  }
  if (!Number.isInteger(definition.priority) || definition.priority < 0) {
    throw new RangeError("event.priority must be a non-negative integer");
  }
  if (
    definition.cooldownSeconds !== undefined &&
    (!Number.isInteger(definition.cooldownSeconds) || definition.cooldownSeconds < 0)
  ) {
    throw new RangeError("event.cooldownSeconds must be a non-negative integer");
  }
  if (typeof definition.enabled !== "boolean") {
    throw new TypeError("event.enabled must be a boolean");
  }
  assertIsoTimestamp(definition.createdAt, "event.createdAt");
}

export function annualOccurrenceKey(definition: WorldEventDefinition, year: number): string {
  assertWorldEventDefinition(definition);
  if (definition.recurrence.kind !== EventRecurrenceKind.ANNUAL) {
    throw new TypeError("annualOccurrenceKey requires an annual event definition");
  }
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError("year must be an integer between 1 and 9999");
  }
  const month = String(definition.recurrence.month).padStart(2, "0");
  const day = String(definition.recurrence.day).padStart(2, "0");
  return `${definition.id}:${year}-${month}-${day}`;
}

export function createScheduledOccurrence(
  input: ScheduledOccurrenceInput,
): ScheduledOccurrence {
  assertNonEmptyString(input.id, "occurrence.id");
  assertNonEmptyString(input.occurrenceKey, "occurrence.occurrenceKey");
  assertIsoTimestamp(input.scheduledFor, "occurrence.scheduledFor");
  assertIsoTimestamp(input.createdAt, "occurrence.createdAt");
  assertWorldEventDefinition(input.definition);
  const status = input.status ?? ScheduledOccurrenceStatus.PENDING;
  assertEnum(status, Object.values(ScheduledOccurrenceStatus), "occurrence.status");

  return {
    id: input.id,
    definitionId: input.definition.id,
    storyWorldId: input.definition.storyWorldId,
    eventKey: input.definition.eventKey,
    scheduledFor: input.scheduledFor,
    timezone: input.definition.timezone,
    occurrenceKey: input.occurrenceKey,
    status,
    createdAt: input.createdAt,
  };
}

export function assertScheduledOccurrence(occurrence: ScheduledOccurrence): void {
  assertNonEmptyString(occurrence.id, "occurrence.id");
  assertNonEmptyString(occurrence.definitionId, "occurrence.definitionId");
  assertNonEmptyString(occurrence.storyWorldId, "occurrence.storyWorldId");
  assertNonEmptyString(occurrence.eventKey, "occurrence.eventKey");
  assertNonEmptyString(occurrence.occurrenceKey, "occurrence.occurrenceKey");
  assertIsoTimestamp(occurrence.scheduledFor, "occurrence.scheduledFor");
  assertIsoTimestamp(occurrence.createdAt, "occurrence.createdAt");
  assertTimezone(occurrence.timezone, "occurrence.timezone");
  assertEnum(occurrence.status, Object.values(ScheduledOccurrenceStatus), "occurrence.status");
}

const allowedTransitions: Readonly<Record<ScheduledOccurrenceStatus, readonly ScheduledOccurrenceStatus[]>> = {
  [ScheduledOccurrenceStatus.PENDING]: [
    ScheduledOccurrenceStatus.ENQUEUED,
    ScheduledOccurrenceStatus.CANCELLED,
  ],
  [ScheduledOccurrenceStatus.ENQUEUED]: [
    ScheduledOccurrenceStatus.RUNNING,
    ScheduledOccurrenceStatus.FAILED,
    ScheduledOccurrenceStatus.CANCELLED,
  ],
  [ScheduledOccurrenceStatus.RUNNING]: [
    ScheduledOccurrenceStatus.COMPLETED,
    ScheduledOccurrenceStatus.FAILED,
    ScheduledOccurrenceStatus.CANCELLED,
  ],
  [ScheduledOccurrenceStatus.FAILED]: [
    ScheduledOccurrenceStatus.ENQUEUED,
    ScheduledOccurrenceStatus.CANCELLED,
  ],
  [ScheduledOccurrenceStatus.COMPLETED]: [],
  [ScheduledOccurrenceStatus.CANCELLED]: [],
};

export function transitionOccurrence(
  occurrence: ScheduledOccurrence,
  nextStatus: ScheduledOccurrenceStatus,
): ScheduledOccurrence {
  assertScheduledOccurrence(occurrence);
  assertEnum(nextStatus, Object.values(ScheduledOccurrenceStatus), "occurrence.nextStatus");
  if (occurrence.status === nextStatus) return { ...occurrence };
  if (!allowedTransitions[occurrence.status].includes(nextStatus)) {
    throw new Error(`cannot transition occurrence from ${occurrence.status} to ${nextStatus}`);
  }
  return { ...occurrence, status: nextStatus };
}
