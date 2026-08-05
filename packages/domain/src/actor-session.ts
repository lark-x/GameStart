import { CharacterRole, type Character } from "./character.ts";
import type { StoryWorld } from "./story-world.ts";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
} from "./validation.ts";

export interface ActorSessionInput {
  id: string;
  storyWorld: StoryWorld;
  userCharacter: Character;
  startedAt: string;
  endedAt?: string;
}

export interface ActorSession {
  id: string;
  storyWorldId: string;
  userCharacterId: string;
  startedAt: string;
  endedAt?: string;
}

function assertUserCharacter(character: Character, storyWorldId: string): void {
  if (character.role !== CharacterRole.USER) {
    throw new TypeError("actorSession.userCharacter must have role USER");
  }
  if (character.storyWorldId !== storyWorldId) {
    throw new TypeError("actorSession.userCharacter must belong to storyWorld");
  }
}

function assertSessionTimes(startedAt: string, endedAt: string | undefined): void {
  assertIsoTimestamp(startedAt, "actorSession.startedAt");
  if (endedAt !== undefined) {
    assertIsoTimestamp(endedAt, "actorSession.endedAt");
    if (Date.parse(endedAt) < Date.parse(startedAt)) {
      throw new TypeError("actorSession.endedAt must not precede startedAt");
    }
  }
}

export function createActorSession(input: ActorSessionInput): ActorSession {
  assertNonEmptyString(input.id, "actorSession.id");
  assertSessionTimes(input.startedAt, input.endedAt);
  assertUserCharacter(input.userCharacter, input.storyWorld.id);

  const session: ActorSession = {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    userCharacterId: input.userCharacter.id,
    startedAt: input.startedAt,
  };
  if (input.endedAt !== undefined) session.endedAt = input.endedAt;
  return session;
}

export function switchActorCharacter(
  session: ActorSession,
  nextCharacter: Character,
): ActorSession {
  if (session.endedAt !== undefined) {
    throw new TypeError("actorSession cannot switch after it has ended");
  }
  assertUserCharacter(nextCharacter, session.storyWorldId);
  return { ...session, userCharacterId: nextCharacter.id };
}
