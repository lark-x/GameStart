import { ActionKind, ActionStatus, EventExecutionStatus, EventRecurrenceKind, MomentDraftStatus, MomentVisibility, PlanInterruptibility, ScheduledOccurrenceStatus, TriggerSource } from "../events.ts";
import type { CreateWorldEventDefinitionRequest, UpdateWorldEventDefinitionRequest } from "../events.ts";
import { type JsonSchema, idSchema, nonEmptyStringSchema, timestampSchema, stringListSchema, workflowObjectSchema } from "./shared.ts";

const onceEventRecurrenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: [EventRecurrenceKind.ONCE] },
    runAt: timestampSchema,
  },
  required: ["kind", "runAt"],
} as const satisfies JsonSchema;

const annualEventRecurrenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: [EventRecurrenceKind.ANNUAL] },
    month: { type: "number", minimum: 1, maximum: 12 },
    day: { type: "number", minimum: 1, maximum: 31 },
    localTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
  },
  required: ["kind", "month", "day", "localTime"],
} as const satisfies JsonSchema;

export const eventRecurrenceSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:event-recurrence",
  title: "EventRecurrence",
  oneOf: [onceEventRecurrenceSchema, annualEventRecurrenceSchema],
} as const satisfies JsonSchema;

export const worldEventDefinitionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:world-event-definition",
  title: "WorldEventDefinition",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    eventKey: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    triggerSource: {
      type: "string",
      enum: Object.values(TriggerSource),
    },
    timezone: nonEmptyStringSchema,
    recurrence: eventRecurrenceSchema,
    targetCharacterIds: { type: "array", items: idSchema },
    recipientCharacterIds: { type: "array", items: idSchema },
    outputs: {
      type: "object", additionalProperties: false,
      properties: { sendMessage: { type: "boolean" }, publishMoment: { type: "boolean" }, generateImage: { type: "boolean" } },
      required: ["sendMessage", "publishMoment", "generateImage"],
    },
    priority: { type: "number", minimum: 0 },
    cooldownSeconds: { type: "number", minimum: 0 },
    enabled: { type: "boolean" },
    createdAt: timestampSchema,
  },
  required: [
    "id",
    "storyWorldId",
    "eventKey",
    "name",
    "triggerSource",
    "timezone",
    "recurrence",
    "targetCharacterIds",
    "recipientCharacterIds",
    "outputs",
    "priority",
    "enabled",
    "createdAt",
  ],
} as const satisfies JsonSchema;

export const createWorldEventDefinitionRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-world-event-definition-request",
  title: "CreateWorldEventDefinitionRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    eventKey: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    triggerSource: { type: "string", enum: Object.values(TriggerSource) },
    timezone: nonEmptyStringSchema,
    recurrence: eventRecurrenceSchema,
    targetCharacterIds: { type: "array", items: idSchema },
    recipientCharacterIds: { type: "array", items: idSchema },
    outputs: {
      type: "object", additionalProperties: false,
      properties: { sendMessage: { type: "boolean" }, publishMoment: { type: "boolean" }, generateImage: { type: "boolean" } },
    },
    priority: { type: "number", minimum: 0 },
    cooldownSeconds: { type: "number", minimum: 0 },
    enabled: { type: "boolean" },
    createdAt: timestampSchema,
  },
  required: [
    "id", "storyWorldId", "eventKey", "name", "triggerSource", "recurrence",
    "targetCharacterIds", "createdAt",
  ],
} as const satisfies JsonSchema;

export const updateWorldEventDefinitionRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-world-event-definition-request",
  title: "UpdateWorldEventDefinitionRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    eventKey: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    triggerSource: { type: "string", enum: Object.values(TriggerSource) },
    timezone: nonEmptyStringSchema,
    recurrence: eventRecurrenceSchema,
    targetCharacterIds: { type: "array", items: idSchema },
    recipientCharacterIds: { type: "array", items: idSchema },
    outputs: {
      type: "object", additionalProperties: false,
      properties: { sendMessage: { type: "boolean" }, publishMoment: { type: "boolean" }, generateImage: { type: "boolean" } },
    },
    priority: { type: "number", minimum: 0 },
    cooldownSeconds: { type: "number", minimum: 0 },
    enabled: { type: "boolean" },
  },
} as const satisfies JsonSchema;

export const scheduledOccurrenceSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:scheduled-occurrence",
  title: "ScheduledOccurrence",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    definitionId: idSchema,
    storyWorldId: idSchema,
    eventKey: nonEmptyStringSchema,
    scheduledFor: timestampSchema,
    timezone: nonEmptyStringSchema,
    occurrenceKey: idSchema,
    status: {
      type: "string",
      enum: Object.values(ScheduledOccurrenceStatus),
    },
    createdAt: timestampSchema,
  },
  required: [
    "id",
    "definitionId",
    "storyWorldId",
    "eventKey",
    "scheduledFor",
    "timezone",
    "occurrenceKey",
    "status",
    "createdAt",
  ],
} as const satisfies JsonSchema;

export const worldCalendarSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:world-calendar",
  title: "WorldCalendar",
  type: "object",
  additionalProperties: false,
  properties: {
    storyWorldId: idSchema,
    startsAt: timestampSchema,
    endsAt: timestampSchema,
    definitions: { type: "array", items: worldEventDefinitionSchema },
    occurrences: { type: "array", items: scheduledOccurrenceSchema },
  },
  required: ["storyWorldId", "startsAt", "endsAt", "definitions", "occurrences"],
} as const satisfies JsonSchema;

export const characterPlanSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:character-plan",
  title: "CharacterPlan",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    characterId: idSchema,
    startsAt: timestampSchema,
    endsAt: timestampSchema,
    timezone: nonEmptyStringSchema,
    location: nonEmptyStringSchema,
    activity: nonEmptyStringSchema,
    interruptibility: {
      type: "string",
      enum: Object.values(PlanInterruptibility),
    },
    createdAt: timestampSchema,
  },
  required: [
    "id",
    "storyWorldId",
    "characterId",
    "startsAt",
    "endsAt",
    "timezone",
    "activity",
    "interruptibility",
    "createdAt",
  ],
} as const satisfies JsonSchema;

export const eventExecutionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:event-execution",
  title: "EventExecution",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    occurrenceId: idSchema,
    definitionId: idSchema,
    storyWorldId: idSchema,
    eventKey: nonEmptyStringSchema,
    targetCharacterIds: { type: "array", items: idSchema },
    attempt: { type: "number", minimum: 1 },
    ruleVersion: nonEmptyStringSchema,
    inputSnapshot: { type: "object" },
    status: {
      type: "string",
      enum: Object.values(EventExecutionStatus),
    },
    startedAt: timestampSchema,
    finishedAt: timestampSchema,
    outputSnapshot: { type: "object" },
    failureReason: nonEmptyStringSchema,
  },
  required: [
    "id",
    "occurrenceId",
    "definitionId",
    "storyWorldId",
    "eventKey",
    "targetCharacterIds",
    "attempt",
    "ruleVersion",
    "inputSnapshot",
    "status",
    "startedAt",
  ],
} as const satisfies JsonSchema;

export const proactiveMessageBudgetSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:proactive-message-budget",
  title: "ProactiveMessageBudget",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    characterId: idSchema,
    windowStartsAt: timestampSchema,
    windowEndsAt: timestampSchema,
    limit: { type: "number", minimum: 0 },
    consumed: { type: "number", minimum: 0 },
    updatedAt: timestampSchema,
  },
  required: [
    "id",
    "storyWorldId",
    "characterId",
    "windowStartsAt",
    "windowEndsAt",
    "limit",
    "consumed",
    "updatedAt",
  ],
} as const satisfies JsonSchema;

export const behaviorActionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:behavior-action",
  title: "BehaviorAction",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    executionId: idSchema,
    storyWorldId: idSchema,
    actorCharacterId: idSchema,
    kind: { type: "string", enum: Object.values(ActionKind) },
    status: { type: "string", enum: Object.values(ActionStatus) },
    priority: { type: "number", minimum: 0 },
    payload: { type: "object" },
    createdAt: timestampSchema,
  },
  required: [
    "id",
    "executionId",
    "storyWorldId",
    "actorCharacterId",
    "kind",
    "status",
    "priority",
    "payload",
    "createdAt",
  ],
} as const satisfies JsonSchema;
