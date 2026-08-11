import type { CharacterId, StoryWorldId } from "./ids.ts";


export const CharacterRole = {
  AI: "AI",
  USER: "USER",
} as const;

export type CharacterRole = (typeof CharacterRole)[keyof typeof CharacterRole];

export const StoryMode = {
  STATIC: "STATIC",
  DYNAMIC: "DYNAMIC",
} as const;

export type StoryMode = (typeof StoryMode)[keyof typeof StoryMode];

export const RelationshipMetric = {
  AFFINITY: "affinity",
  TRUST: "trust",
  CONFLICT: "conflict",
  DEPENDENCY: "dependency",
} as const;

export type RelationshipMetric =
  (typeof RelationshipMetric)[keyof typeof RelationshipMetric];

export interface RelationshipStateDto {
  affinity: number;
  trust: number;
  conflict: number;
  dependency: number;
}

export type RelationshipDeltaDto = RelationshipStateDto;

export interface CharacterDto {
  id: CharacterId;
  displayName: string;
  role: CharacterRole;
  storyWorldId: StoryWorldId;
  timezone: string;
  birthDate?: string;
  personaPrompt?: string;
  personaPromptRef?: string;
  visualPromptRef?: string;
}
