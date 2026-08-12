import type {
  V2CharacterId,
  V2CreateCharacterRequest,
  V2CreateFactRequest,
  V2CreateLocationRequest,
  V2CreateRuleRequest,
  V2CreateStoryWorldRequest,
  V2CreateTimelineEventRequest,
  V2FactVisibility,
  V2IdempotencyKey,
  V2LocationId,
  V2Revision,
  V2RuleSeverity,
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

function requiredRevision(value: unknown): V2Revision {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new V2HttpError(400, "BAD_REQUEST", "expectedRevision must be a positive integer");
  }
  return value as V2Revision;
}
