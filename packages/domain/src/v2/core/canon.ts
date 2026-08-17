import { V2DomainError } from "../shared/index.ts";

export type V2CanonStoryWorldId = string;
export type V2CanonCharacterId = string;
export type V2CanonLocationId = string;
export type V2CanonRevision = number;
export type V2CanonFactVisibility = "creator_only" | "player_visible";
export type V2CanonRuleSeverity = "guideline" | "required";

export interface V2CanonWorld {
  readonly storyWorldId: V2CanonStoryWorldId;
  readonly name: string;
  readonly summary?: string;
  readonly revision: V2CanonRevision;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface V2CanonLocation {
  readonly locationId: V2CanonLocationId;
  readonly storyWorldId: V2CanonStoryWorldId;
  readonly name: string;
  readonly summary?: string;
  readonly createdAt?: string;
}

export interface V2CanonCharacter {
  readonly characterId: V2CanonCharacterId;
  readonly storyWorldId: V2CanonStoryWorldId;
  readonly name: string;
  readonly summary?: string;
  readonly personaText?: string;
  readonly homeLocationId?: V2CanonLocationId;
  readonly createdAt?: string;
}

export interface V2CanonFact {
  readonly factId: string;
  readonly storyWorldId: V2CanonStoryWorldId;
  readonly text: string;
  readonly visibility: V2CanonFactVisibility;
  readonly createdAt?: string;
}

export interface V2CanonRule {
  readonly ruleId: string;
  readonly storyWorldId: V2CanonStoryWorldId;
  readonly text: string;
  readonly severity: V2CanonRuleSeverity;
  readonly createdAt?: string;
}

export interface V2CanonTimelineEvent {
  readonly timelineEventId: string;
  readonly storyWorldId: V2CanonStoryWorldId;
  readonly localDate: string;
  readonly title: string;
  readonly summary?: string;
  readonly createdAt?: string;
}

export function createV2CanonWorld(input: {
    readonly storyWorldId: V2CanonStoryWorldId;
  readonly name: string;
  readonly summary?: string;
}): V2CanonWorld {
  return {
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    name: assertNonEmptyText(input.name, "name", 120),
    ...(input.summary === undefined ? {} : { summary: assertOptionalText(input.summary, "summary", 1200) }),
    revision: 1,
  };
}

export function createV2CanonLocation(input: {
    readonly storyWorldId: V2CanonStoryWorldId;
    readonly locationId: V2CanonLocationId;
  readonly name: string;
  readonly summary?: string;
}): V2CanonLocation {
  return {
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    locationId: assertNonEmptyId(input.locationId, "locationId"),
    name: assertNonEmptyText(input.name, "name", 120),
    ...(input.summary === undefined ? {} : { summary: assertOptionalText(input.summary, "summary", 1200) }),
  };
}

export function createV2CanonCharacter(input: {
    readonly storyWorldId: V2CanonStoryWorldId;
    readonly characterId: V2CanonCharacterId;
  readonly name: string;
  readonly summary?: string;
  readonly personaText?: string;
  readonly homeLocation?: V2CanonLocation;
    readonly homeLocationId?: V2CanonLocationId;
}): V2CanonCharacter {
  if (input.homeLocation && input.homeLocation.storyWorldId !== input.storyWorldId) {
    throw new V2DomainError("CROSS_WORLD_REFERENCE", "homeLocationId must belong to the same story world");
  }
  const homeLocationId = input.homeLocation?.locationId ?? input.homeLocationId;
  return {
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    characterId: assertNonEmptyId(input.characterId, "characterId"),
    name: assertNonEmptyText(input.name, "name", 120),
    ...(input.summary === undefined ? {} : { summary: assertOptionalText(input.summary, "summary", 1200) }),
    ...(input.personaText === undefined ? {} : { personaText: assertOptionalText(input.personaText, "personaText", 4000) }),
    ...(homeLocationId === undefined ? {} : { homeLocationId: assertNonEmptyId(homeLocationId, "homeLocationId") }),
  };
}

export function createV2CanonFact(input: {
    readonly storyWorldId: V2CanonStoryWorldId;
  readonly factId: string;
  readonly text: string;
    readonly visibility: V2CanonFactVisibility;
}): V2CanonFact {
  if (input.visibility !== "creator_only" && input.visibility !== "player_visible") {
    throw new V2DomainError("INVALID_INPUT", "visibility must be creator_only or player_visible");
  }
  return {
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    factId: assertNonEmptyId(input.factId, "factId"),
    text: assertNonEmptyText(input.text, "text", 2000),
    visibility: input.visibility,
  };
}

export function createV2CanonRule(input: {
    readonly storyWorldId: V2CanonStoryWorldId;
  readonly ruleId: string;
  readonly text: string;
    readonly severity: V2CanonRuleSeverity;
}): V2CanonRule {
  if (input.severity !== "guideline" && input.severity !== "required") {
    throw new V2DomainError("INVALID_INPUT", "severity must be guideline or required");
  }
  return {
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    ruleId: assertNonEmptyId(input.ruleId, "ruleId"),
    text: assertNonEmptyText(input.text, "text", 2000),
    severity: input.severity,
  };
}

export function createV2CanonTimelineEvent(input: {
    readonly storyWorldId: V2CanonStoryWorldId;
  readonly timelineEventId: string;
  readonly localDate: string;
  readonly title: string;
  readonly summary?: string;
}): V2CanonTimelineEvent {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) {
    throw new V2DomainError("INVALID_INPUT", "localDate must use YYYY-MM-DD");
  }
  return {
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    timelineEventId: assertNonEmptyId(input.timelineEventId, "timelineEventId"),
    localDate: input.localDate,
    title: assertNonEmptyText(input.title, "title", 160),
    ...(input.summary === undefined ? {} : { summary: assertOptionalText(input.summary, "summary", 1200) }),
  };
}

export function assertV2ExpectedRevision(actual: V2CanonRevision, expected: V2CanonRevision): void {
  if (actual !== expected) {
    throw new V2DomainError("STALE_REVISION", `Expected canon revision ${expected}, got ${actual}`);
  }
}

function assertNonEmptyId<T extends string>(value: T, field: string): T {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a non-empty id up to 128 characters`);
  }
  return value;
}

function assertNonEmptyText(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be between 1 and ${maxLength} characters`);
  }
  return trimmed;
}

function assertOptionalText(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be ${maxLength} characters or shorter`);
  }
  return trimmed;
}
