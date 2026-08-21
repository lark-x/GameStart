import { V2DomainError } from "../shared/index.ts";

export type V2CanonStoryWorldId = string;
export type V2CanonCharacterId = string;
export type V2CanonLocationId = string;
export type V2CanonRevision = number;
export type V2CanonFactVisibility = "creator_only" | "player_visible";
export type V2CanonRuleSeverity = "guideline" | "required";
export type V2CanonCharacterRelationshipType = "friend" | "family" | "romantic" | "enemy" | "mentor" | "student" | "colleague" | "rival" | "unknown" | "custom";
export type V2CanonCharacterRelationshipVisibility = "creator_only" | "player_visible";

export interface V2CanonCharacterPersona {
  readonly traits: readonly string[];
  readonly behaviorPatterns: readonly string[];
  readonly speechStyle?: string;
  readonly values: readonly string[];
  readonly taboos: readonly string[];
  readonly backgroundStory?: string;
  readonly advancedPrompt?: string;
}

export interface V2CanonCharacterProfile {
  readonly aliases: readonly string[];
  readonly identity?: string;
  readonly tags: readonly string[];
  readonly persona: V2CanonCharacterPersona;
}
export type V2CanonCharacterProfileInput = Partial<Omit<V2CanonCharacterProfile, "persona">> & { readonly persona?: Partial<V2CanonCharacterPersona> };

export interface V2CanonCharacterRelationship {
  readonly relationshipId: string;
  readonly storyWorldId: string;
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly type: V2CanonCharacterRelationshipType;
  readonly customLabel?: string;
  readonly description?: string;
  readonly strength: number;
  readonly visibility: V2CanonCharacterRelationshipVisibility;
  readonly archivedAt?: string;
}

export interface V2CanonCharacterStateDefinition {
  readonly stateDefinitionId: string;
  readonly storyWorldId: string;
  readonly characterId: string;
  readonly key: string;
  readonly valueType: "string" | "number" | "boolean";
  readonly defaultValue: string | number | boolean;
  readonly constraints: Readonly<Record<string, string | number | boolean>>;
  readonly archivedAt?: string;
}
export interface V2CanonCharacterVisualVariant {
  readonly visualVariantId: string;
  readonly storyWorldId: string;
  readonly characterId: string;
  readonly name: string;
  readonly appearance: Readonly<Record<string, string>>;
  readonly loras: readonly { readonly name: string; readonly weight: number }[];
  readonly triggerWords: readonly string[];
  readonly negativePrompt?: string;
  readonly workflowPreset?: string;
  readonly isDefault: boolean;
  readonly referenceAssetIds: readonly string[];
  readonly archivedAt?: string;
}
export interface V2CanonCharacterEventDefinition {
  readonly eventDefinitionId: string;
  readonly storyWorldId: string;
  readonly name: string;
  readonly description?: string;
  readonly participantCharacterIds: readonly string[];
  readonly initialState: Readonly<Record<string, string | number | boolean>>;
  readonly archivedAt?: string;
}

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
  readonly profile?: V2CanonCharacterProfile;
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
  readonly profile?: V2CanonCharacterProfileInput;
  readonly homeLocation?: V2CanonLocation;
    readonly homeLocationId?: V2CanonLocationId;
}): V2CanonCharacter {
  if (input.homeLocation && input.homeLocation.storyWorldId !== input.storyWorldId) {
    throw new V2DomainError("CROSS_WORLD_REFERENCE", "homeLocationId must belong to the same story world");
  }
  const homeLocationId = input.homeLocation?.locationId ?? input.homeLocationId;
  const profile = normalizeCharacterProfile(input.profile, input.personaText);
  return {
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    characterId: assertNonEmptyId(input.characterId, "characterId"),
    name: assertNonEmptyText(input.name, "name", 120),
    ...(input.summary === undefined ? {} : { summary: assertOptionalText(input.summary, "summary", 1200) }),
    ...(input.personaText === undefined ? {} : { personaText: assertOptionalText(input.personaText, "personaText", 4000) }),
    profile,
    ...(homeLocationId === undefined ? {} : { homeLocationId: assertNonEmptyId(homeLocationId, "homeLocationId") }),
  };
}

export function createV2CanonCharacterRelationship(input: Omit<V2CanonCharacterRelationship, "archivedAt">): V2CanonCharacterRelationship {
  if (input.fromCharacterId === input.toCharacterId) throw new V2DomainError("INVALID_INPUT", "character relationships cannot target the same character");
  if (!Number.isInteger(input.strength) || input.strength < -100 || input.strength > 100) throw new V2DomainError("INVALID_INPUT", "strength must be an integer between -100 and 100");
  const validTypes = ["friend", "family", "romantic", "enemy", "mentor", "student", "colleague", "rival", "unknown", "custom"];
  if (!validTypes.includes(input.type)) throw new V2DomainError("INVALID_INPUT", "invalid relationship type");
  if (input.type === "custom" && !input.customLabel?.trim()) throw new V2DomainError("INVALID_INPUT", "custom relationships require customLabel");
  if (input.visibility !== "creator_only" && input.visibility !== "player_visible") throw new V2DomainError("INVALID_INPUT", "invalid relationship visibility");
  return {
    relationshipId: input.relationshipId,
    storyWorldId: input.storyWorldId,
    fromCharacterId: input.fromCharacterId,
    toCharacterId: input.toCharacterId,
    type: input.type,
    strength: input.strength,
    visibility: input.visibility,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.customLabel?.trim() ? { customLabel: input.customLabel.trim() } : {}),
  };
}

export function createV2CanonCharacterStateDefinition(input: Omit<V2CanonCharacterStateDefinition, "archivedAt" | "constraints"> & { readonly constraints?: Readonly<Record<string, string | number | boolean>> }): V2CanonCharacterStateDefinition {
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,119}$/.test(input.key)) throw new V2DomainError("INVALID_INPUT", "state key must be 1-120 characters and start with a letter");
  if (!["string", "number", "boolean"].includes(input.valueType)) throw new V2DomainError("INVALID_INPUT", "invalid character state value type");
  if (typeof input.defaultValue !== input.valueType) throw new V2DomainError("INVALID_INPUT", "defaultValue does not match valueType");
  return { ...input, constraints: input.constraints ?? {} };
}

export function createV2CanonCharacterVisualVariant(input: Omit<V2CanonCharacterVisualVariant, "archivedAt">): V2CanonCharacterVisualVariant {
  if (input.name.trim().length === 0 || input.name.length > 120) throw new V2DomainError("INVALID_INPUT", "visual variant name must be 1-120 characters");
  if (input.loras.some((lora) => !lora.name.trim() || !Number.isFinite(lora.weight) || lora.weight < 0 || lora.weight > 2)) throw new V2DomainError("INVALID_INPUT", "LoRA weight must be between 0 and 2");
  if (input.triggerWords.length > 50 || input.triggerWords.some((word) => word.length > 200)) throw new V2DomainError("INVALID_INPUT", "invalid trigger words");
  return { ...input, name: input.name.trim() };
}

export function createV2CanonCharacterEventDefinition(input: Omit<V2CanonCharacterEventDefinition, "archivedAt">): V2CanonCharacterEventDefinition {
  if (input.name.trim().length === 0 || input.name.length > 160) throw new V2DomainError("INVALID_INPUT", "event name must be 1-160 characters");
  if (new Set(input.participantCharacterIds).size !== input.participantCharacterIds.length) throw new V2DomainError("INVALID_INPUT", "event participants must be unique");
  return { ...input, name: input.name.trim() };
}

function normalizeCharacterProfile(input: V2CanonCharacterProfileInput | undefined, legacyPersonaText: string | undefined): V2CanonCharacterProfile {
  const persona: Partial<V2CanonCharacterPersona> = input?.persona ?? {};
  return {
    aliases: normalizeList(input?.aliases, "aliases"),
    tags: normalizeList(input?.tags, "tags"),
    ...(input?.identity === undefined ? {} : { identity: assertOptionalText(input.identity, "identity", 1000) }),
    persona: {
      traits: normalizeList(persona.traits, "traits"),
      behaviorPatterns: normalizeList(persona.behaviorPatterns, "behaviorPatterns"),
      values: normalizeList(persona.values, "values"),
      taboos: normalizeList(persona.taboos, "taboos"),
      ...(persona.speechStyle === undefined ? {} : { speechStyle: assertOptionalText(persona.speechStyle, "speechStyle", 1200) }),
      ...(persona.backgroundStory === undefined ? {} : { backgroundStory: assertOptionalText(persona.backgroundStory, "backgroundStory", 4000) }),
      ...(persona.advancedPrompt === undefined && legacyPersonaText === undefined ? {} : { advancedPrompt: assertOptionalText(persona.advancedPrompt ?? legacyPersonaText ?? "", "advancedPrompt", 4000) }),
    },
  };
}

function normalizeList(values: readonly string[] | undefined, field: string): readonly string[] {
  if (values === undefined) return [];
  if (values.length > 20) throw new V2DomainError("INVALID_INPUT", `${field} must contain at most 20 items`);
  return values.map((value) => assertNonEmptyText(value, field, 200));
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
