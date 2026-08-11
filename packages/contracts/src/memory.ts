import type { CharacterId, MemoryId, StoryWorldId } from "./ids.ts";

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

export interface MemoryItemDto {
  id: MemoryId;
  storyWorldId: StoryWorldId;
  kind: MemoryKind;
  visibility: MemoryVisibility;
  source: MemorySource;
  content: string;
  confidence: number;
  createdAt: string;
  occurredAt?: string;
  subjectCharacterId?: CharacterId;
  audienceCharacterIds: readonly CharacterId[];
  sourceRef?: string;
}
