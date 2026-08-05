import type { Character } from "./character.ts";
import type { StoryWorld } from "./story-world.ts";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
} from "./validation.ts";

export const MemoryKind = {
  EVENT_FACT: "EVENT_FACT",
  CONVERSATION_SUMMARY: "CONVERSATION_SUMMARY",
  CHARACTER_IMPRESSION: "CHARACTER_IMPRESSION",
  USER_PREFERENCE: "USER_PREFERENCE",
} as const;

export type MemoryKind = (typeof MemoryKind)[keyof typeof MemoryKind];

export const MemoryVisibility = {
  PRIVATE: "PRIVATE",
  RELATION: "RELATION",
  GROUP: "GROUP",
  PUBLIC: "PUBLIC",
  SYSTEM: "SYSTEM",
} as const;

export type MemoryVisibility =
  (typeof MemoryVisibility)[keyof typeof MemoryVisibility];

export const MemorySource = {
  USER_AUTHORED: "USER_AUTHORED",
  LLM_DERIVED: "LLM_DERIVED",
  SYSTEM_EVENT: "SYSTEM_EVENT",
  IMPORTED: "IMPORTED",
} as const;

export type MemorySource = (typeof MemorySource)[keyof typeof MemorySource];

export interface MemoryItem {
  id: string;
  storyWorldId: string;
  kind: MemoryKind;
  visibility: MemoryVisibility;
  source: MemorySource;
  content: string;
  confidence: number;
  createdAt: string;
  occurredAt?: string;
  subjectCharacterId?: string;
  audienceCharacterIds: readonly string[];
  sourceRef?: string;
}

export interface MemoryInput {
  id: string;
  storyWorld: StoryWorld;
  kind: MemoryKind;
  visibility: MemoryVisibility;
  source: MemorySource;
  content: string;
  confidence: number;
  createdAt: string;
  occurredAt?: string;
  subjectCharacter?: Character;
  audienceCharacters?: readonly Character[];
  sourceRef?: string;
}

export interface MemorySearchQuery {
  storyWorldId: string;
  readerCharacterId: string;
  queryText: string;
  limit?: number;
}

export interface MemorySearchResult {
  memory: MemoryItem;
  score: number;
}

function assertEnum<T extends string>(value: T, values: readonly T[], field: string): void {
  if (!values.includes(value)) throw new TypeError(`${field} has an unsupported value`);
}

function assertCharacterWorld(
  characters: readonly Character[],
  storyWorldId: string,
  field: string,
): void {
  const ids = new Set<string>();
  for (const character of characters) {
    if (ids.has(character.id)) throw new TypeError(`${field} contains duplicate character`);
    ids.add(character.id);
    if (character.storyWorldId !== storyWorldId) {
      throw new TypeError(`${field} must belong to storyWorld`);
    }
  }
}

export function createMemoryItem(input: MemoryInput): MemoryItem {
  assertNonEmptyString(input.id, "memory.id");
  assertNonEmptyString(input.content, "memory.content");
  assertIsoTimestamp(input.createdAt, "memory.createdAt");
  if (input.occurredAt !== undefined) assertIsoTimestamp(input.occurredAt, "memory.occurredAt");
  if (input.sourceRef !== undefined) assertNonEmptyString(input.sourceRef, "memory.sourceRef");
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new RangeError("memory.confidence must be between 0 and 1");
  }
  assertEnum(input.kind, Object.values(MemoryKind), "memory.kind");
  assertEnum(input.visibility, Object.values(MemoryVisibility), "memory.visibility");
  assertEnum(input.source, Object.values(MemorySource), "memory.source");

  const subject = input.subjectCharacter;
  const audience = input.audienceCharacters ?? [];
  if (subject && subject.storyWorldId !== input.storyWorld.id) {
    throw new TypeError("memory.subjectCharacter must belong to storyWorld");
  }
  assertCharacterWorld(audience, input.storyWorld.id, "memory.audienceCharacters");

  if (input.visibility === MemoryVisibility.PRIVATE && subject === undefined) {
    throw new TypeError("PRIVATE memory requires a subjectCharacter");
  }
  if (
    (input.visibility === MemoryVisibility.RELATION || input.visibility === MemoryVisibility.GROUP) &&
    audience.length === 0
  ) {
    throw new TypeError(`${input.visibility} memory requires audienceCharacters`);
  }
  if (input.visibility === MemoryVisibility.SYSTEM && audience.length > 0) {
    throw new TypeError("SYSTEM memory cannot have audienceCharacters");
  }

  const memory: MemoryItem = {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    kind: input.kind,
    visibility: input.visibility,
    source: input.source,
    content: input.content,
    confidence: input.confidence,
    createdAt: input.createdAt,
    audienceCharacterIds: audience.map((character) => character.id),
  };
  if (input.occurredAt !== undefined) memory.occurredAt = input.occurredAt;
  if (subject !== undefined) memory.subjectCharacterId = subject.id;
  if (input.sourceRef !== undefined) memory.sourceRef = input.sourceRef;
  assertMemoryItem(memory);
  return memory;
}

export function assertMemoryItem(memory: MemoryItem): void {
  assertNonEmptyString(memory.id, "memory.id");
  assertNonEmptyString(memory.storyWorldId, "memory.storyWorldId");
  assertNonEmptyString(memory.content, "memory.content");
  assertIsoTimestamp(memory.createdAt, "memory.createdAt");
  if (memory.occurredAt !== undefined) assertIsoTimestamp(memory.occurredAt, "memory.occurredAt");
  if (memory.sourceRef !== undefined) assertNonEmptyString(memory.sourceRef, "memory.sourceRef");
  if (!Number.isFinite(memory.confidence) || memory.confidence < 0 || memory.confidence > 1) {
    throw new RangeError("memory.confidence must be between 0 and 1");
  }
  assertEnum(memory.kind, Object.values(MemoryKind), "memory.kind");
  assertEnum(memory.visibility, Object.values(MemoryVisibility), "memory.visibility");
  assertEnum(memory.source, Object.values(MemorySource), "memory.source");
  const audienceIds = new Set<string>();
  for (const id of memory.audienceCharacterIds) {
    assertNonEmptyString(id, "memory.audienceCharacterIds");
    if (audienceIds.has(id)) throw new TypeError("memory.audienceCharacterIds contains duplicate character");
    audienceIds.add(id);
  }
  if (memory.subjectCharacterId !== undefined) {
    assertNonEmptyString(memory.subjectCharacterId, "memory.subjectCharacterId");
  }
  if (memory.visibility === MemoryVisibility.PRIVATE && memory.subjectCharacterId === undefined) {
    throw new TypeError("PRIVATE memory requires a subjectCharacterId");
  }
  if (
    (memory.visibility === MemoryVisibility.RELATION || memory.visibility === MemoryVisibility.GROUP) &&
    memory.audienceCharacterIds.length === 0
  ) {
    throw new TypeError(`${memory.visibility} memory requires audienceCharacterIds`);
  }
  if (memory.visibility === MemoryVisibility.SYSTEM && memory.audienceCharacterIds.length > 0) {
    throw new TypeError("SYSTEM memory cannot have audienceCharacterIds");
  }
}

export function isMemoryVisibleTo(memory: MemoryItem, readerCharacterId: string): boolean {
  if (memory.visibility === MemoryVisibility.PUBLIC) return true;
  if (memory.visibility === MemoryVisibility.SYSTEM) return false;
  if (memory.visibility === MemoryVisibility.PRIVATE) {
    return memory.subjectCharacterId === readerCharacterId;
  }
  return memory.audienceCharacterIds.includes(readerCharacterId);
}

function tokenize(value: string): readonly string[] {
  return [...new Set(value.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))];
}

export function scoreMemory(memory: MemoryItem, queryText: string): number {
  const queryTokens = tokenize(queryText);
  if (queryTokens.length === 0) return 0;
  const contentTokens = new Set(tokenize(memory.content));
  const matches = queryTokens.filter((token) => contentTokens.has(token)).length;
  if (matches === 0) return 0;
  return matches / queryTokens.length + memory.confidence * 0.25;
}
