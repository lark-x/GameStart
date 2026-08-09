import {
  assertIsoDate,
  assertNonEmptyString,
  assertTimezone,
} from "./validation.ts";

export const CharacterRole = {
  AI: "AI",
  USER: "USER",
} as const;

export type CharacterRole = (typeof CharacterRole)[keyof typeof CharacterRole];

export interface Character {
  id: string;
  displayName: string;
  role: CharacterRole;
  storyWorldId: string;
  timezone: string;
  birthDate?: string;
  personaPrompt?: string;
  personaPromptRef?: string;
  visualPromptRef?: string;
}

export interface CharacterInput {
  id: string;
  displayName: string;
  role: CharacterRole;
  storyWorldId: string;
  timezone: string;
  birthDate?: string;
  personaPrompt?: string;
  personaPromptRef?: string;
  visualPromptRef?: string;
}

function assertPromptReference(value: string | undefined, field: string): void {
  if (value !== undefined) {
    assertNonEmptyString(value, field);
  }
}

export function createCharacter(input: CharacterInput): Character {
  assertNonEmptyString(input.id, "character.id");
  assertNonEmptyString(input.displayName, "character.displayName");
  assertNonEmptyString(input.storyWorldId, "character.storyWorldId");
  assertTimezone(input.timezone, "character.timezone");

  if (input.role !== CharacterRole.AI && input.role !== CharacterRole.USER) {
    throw new TypeError(`character.role must be AI or USER`);
  }
  if (input.birthDate !== undefined) {
    assertIsoDate(input.birthDate, "character.birthDate");
  }
  assertPromptReference(input.personaPrompt, "character.personaPrompt");
  assertPromptReference(input.personaPromptRef, "character.personaPromptRef");
  assertPromptReference(input.visualPromptRef, "character.visualPromptRef");

  const character: Character = {
    id: input.id,
    displayName: input.displayName,
    role: input.role,
    storyWorldId: input.storyWorldId,
    timezone: input.timezone,
  };

  if (input.birthDate !== undefined) character.birthDate = input.birthDate;
  if (input.personaPrompt !== undefined) character.personaPrompt = input.personaPrompt;
  if (input.personaPromptRef !== undefined) character.personaPromptRef = input.personaPromptRef;
  if (input.visualPromptRef !== undefined) character.visualPromptRef = input.visualPromptRef;
  return character;
}
