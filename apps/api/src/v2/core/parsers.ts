import type {
  V2CharacterId,
  V2ArcId,
  V2ChoiceId,
  V2CreateArcRequest,
  V2CreateCharacterRequest,
  V2CreateChoiceRequest,
  V2CreateFactRequest,
  V2CreateLocationRequest,
  V2CreateRuleRequest,
  V2CreateSceneRequest,
  V2CreateStoryWorldRequest,
  V2CreateStateVariableRequest,
  V2CreateTimelineEventRequest,
  V2FactVisibility,
  V2IdempotencyKey,
  V2LocationId,
  V2PreviewStateDeltaRequest,
  V2Revision,
  V2RuleSeverity,
  V2SceneId,
  V2StateComparisonOperator,
  V2StateConsequenceOperation,
  V2StateDeltaDto,
  V2StateGateDto,
  V2StateValue,
  V2StateValueType,
  V2StoryWorldId,
} from "@living-network/contracts";

import { V2HttpError } from "./errors.ts";

export function parseCreateWorldBody(body: unknown): V2CreateStoryWorldRequest {
  const value = requireBody(body);
  assertKeys(value, ["storyWorldId", "name", "summary", "idempotencyKey"]);
  return {
    storyWorldId: requiredString(value.storyWorldId, "storyWorldId") as V2StoryWorldId,
    name: requiredString(value.name, "name"),
    ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateLocationBody(body: unknown): V2CreateLocationRequest {
  const value = requireRevisionedBody(body, ["locationId", "name", "summary"]);
  return {
    locationId: requiredString(value.locationId, "locationId") as V2LocationId,
    name: requiredString(value.name, "name"),
    ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateCharacterBody(body: unknown): V2CreateCharacterRequest {
  const value = requireRevisionedBody(body, ["characterId", "name", "summary", "homeLocationId"]);
  return {
    characterId: requiredString(value.characterId, "characterId") as V2CharacterId,
    name: requiredString(value.name, "name"),
    ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }),
    ...(value.homeLocationId === undefined ? {} : { homeLocationId: requiredString(value.homeLocationId, "homeLocationId") as V2LocationId }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateFactBody(body: unknown): V2CreateFactRequest {
  const value = requireRevisionedBody(body, ["factId", "text", "visibility"]);
  const visibility = requiredString(value.visibility, "visibility");
  if (visibility !== "creator_only" && visibility !== "player_visible") {
    throw new V2HttpError(400, "BAD_REQUEST", "visibility must be creator_only or player_visible");
  }
  return {
    factId: requiredString(value.factId, "factId"),
    text: requiredString(value.text, "text"),
    visibility: visibility as V2FactVisibility,
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateRuleBody(body: unknown): V2CreateRuleRequest {
  const value = requireRevisionedBody(body, ["ruleId", "text", "severity"]);
  const severity = requiredString(value.severity, "severity");
  if (severity !== "guideline" && severity !== "required") {
    throw new V2HttpError(400, "BAD_REQUEST", "severity must be guideline or required");
  }
  return {
    ruleId: requiredString(value.ruleId, "ruleId"),
    text: requiredString(value.text, "text"),
    severity: severity as V2RuleSeverity,
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateTimelineEventBody(body: unknown): V2CreateTimelineEventRequest {
  const value = requireRevisionedBody(body, ["timelineEventId", "localDate", "title", "summary"]);
  return {
    timelineEventId: requiredString(value.timelineEventId, "timelineEventId"),
    localDate: requiredString(value.localDate, "localDate"),
    title: requiredString(value.title, "title"),
    ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateArcBody(body: unknown): V2CreateArcRequest {
  const value = requireRevisionedBody(body, ["arcId", "title", "summary"]);
  return {
    arcId: requiredString(value.arcId, "arcId") as V2ArcId,
    title: requiredString(value.title, "title"),
    ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateSceneBody(body: unknown): V2CreateSceneRequest {
  const value = requireRevisionedBody(body, ["sceneId", "arcId", "title", "body", "isEntry"]);
  return {
    sceneId: requiredString(value.sceneId, "sceneId") as V2SceneId,
    ...(value.arcId === undefined ? {} : { arcId: requiredString(value.arcId, "arcId") as V2ArcId }),
    title: requiredString(value.title, "title"),
    ...(value.body === undefined ? {} : { body: requiredString(value.body, "body") }),
    ...(value.isEntry === undefined ? {} : { isEntry: requiredBoolean(value.isEntry, "isEntry") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateChoiceBody(body: unknown): V2CreateChoiceRequest {
  const value = requireRevisionedBody(body, ["choiceId", "sourceSceneId", "targetSceneId", "label", "gates", "consequences"]);
  return {
    choiceId: requiredString(value.choiceId, "choiceId") as V2ChoiceId,
    sourceSceneId: requiredString(value.sourceSceneId, "sourceSceneId") as V2SceneId,
    ...(value.targetSceneId === undefined ? {} : { targetSceneId: requiredString(value.targetSceneId, "targetSceneId") as V2SceneId }),
    label: requiredString(value.label, "label"),
    ...(value.gates === undefined ? {} : { gates: requiredGates(value.gates) }),
    ...(value.consequences === undefined ? {} : { consequences: requiredDeltas(value.consequences, "consequences") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateStateVariableBody(body: unknown): V2CreateStateVariableRequest {
  const value = requireRevisionedBody(body, ["key", "valueType", "defaultValue"]);
  const valueType = requiredValueType(value.valueType);
  return {
    key: requiredString(value.key, "key"),
    valueType,
    defaultValue: requiredStateValue(value.defaultValue, "defaultValue"),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parsePreviewStateDeltaBody(body: unknown): V2PreviewStateDeltaRequest {
  const value = requireBody(body);
  assertKeys(value, ["currentValues", "deltas"]);
  return {
    ...(value.currentValues === undefined ? {} : { currentValues: requiredStateRecord(value.currentValues, "currentValues") }),
    deltas: requiredDeltas(value.deltas, "deltas"),
  };
}

function requireRevisionedBody(body: unknown, keys: readonly string[]): Record<string, unknown> {
  const value = requireBody(body);
  assertKeys(value, [...keys, "expectedRevision", "idempotencyKey"]);
  return value;
}

function requireBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  return body as Record<string, unknown>;
}

function assertKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body contains unknown fields");
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", `${field} must be a non-empty string`);
  }
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new V2HttpError(400, "BAD_REQUEST", `${field} must be a boolean`);
  }
  return value;
}

function requiredRevision(value: unknown): V2Revision {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new V2HttpError(400, "BAD_REQUEST", "expectedRevision must be a positive integer");
  }
  return value as V2Revision;
}

function requiredValueType(value: unknown): V2StateValueType {
  if (value !== "string" && value !== "number" && value !== "boolean") {
    throw new V2HttpError(400, "BAD_REQUEST", "valueType must be string, number, or boolean");
  }
  return value;
}

function requiredStateValue(value: unknown, field: string): V2StateValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  throw new V2HttpError(400, "BAD_REQUEST", `${field} must be a string, number, or boolean`);
}

function requiredStateRecord(value: unknown, field: string): Record<string, V2StateValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new V2HttpError(400, "BAD_REQUEST", `${field} must be an object`);
  }
  return Object.fromEntries(Object.entries(value).map(([key, recordValue]) => [
    key,
    requiredStateValue(recordValue, `${field}.${key}`),
  ]));
}

function requiredGates(value: unknown): readonly V2StateGateDto[] {
  return requiredArray(value, "gates").map((item, index) => {
    const gate = requiredRecord(item, `gates[${index}]`);
    assertKeys(gate, ["stateKey", "operator", "value"]);
    return {
      stateKey: requiredString(gate.stateKey, `gates[${index}].stateKey`),
      operator: requiredComparisonOperator(gate.operator),
      value: requiredStateValue(gate.value, `gates[${index}].value`),
    };
  });
}

function requiredDeltas(value: unknown, field: string): readonly V2StateDeltaDto[] {
  return requiredArray(value, field).map((item, index) => {
    const delta = requiredRecord(item, `${field}[${index}]`);
    assertKeys(delta, ["stateKey", "operation", "value"]);
    return {
      stateKey: requiredString(delta.stateKey, `${field}[${index}].stateKey`),
      operation: requiredConsequenceOperation(delta.operation),
      value: requiredStateValue(delta.value, `${field}[${index}].value`),
    };
  });
}

function requiredComparisonOperator(value: unknown): V2StateComparisonOperator {
  if (value !== "eq" && value !== "neq" && value !== "gt" && value !== "gte" && value !== "lt" && value !== "lte") {
    throw new V2HttpError(400, "BAD_REQUEST", "gate operator is not supported");
  }
  return value;
}

function requiredConsequenceOperation(value: unknown): V2StateConsequenceOperation {
  if (value !== "set" && value !== "increment") {
    throw new V2HttpError(400, "BAD_REQUEST", "state operation is not supported");
  }
  return value;
}

function requiredArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new V2HttpError(400, "BAD_REQUEST", `${field} must be an array`);
  }
  return value;
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new V2HttpError(400, "BAD_REQUEST", `${field} must be an object`);
  }
  return value as Record<string, unknown>;
}
