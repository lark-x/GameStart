import { StoryMode, type StoryMode as StoryModeValue } from "./story-mode.ts";
import { assertNonEmptyString, assertTimezone } from "./validation.ts";

export interface StoryWorld {
  id: string;
  name: string;
  timezone: string;
  storyMode: StoryModeValue;
  relationshipDynamicsEnabled: boolean;
}

export interface StoryWorldInput {
  id: string;
  name: string;
  timezone: string;
  storyMode: StoryModeValue;
  relationshipDynamicsEnabled: boolean;
}

export function createStoryWorld(input: StoryWorldInput): StoryWorld {
  assertNonEmptyString(input.id, "storyWorld.id");
  assertNonEmptyString(input.name, "storyWorld.name");
  assertTimezone(input.timezone, "storyWorld.timezone");

  if (input.storyMode !== StoryMode.STATIC && input.storyMode !== StoryMode.DYNAMIC) {
    throw new TypeError("storyWorld.storyMode must be STATIC or DYNAMIC");
  }

  const expectedDynamics = input.storyMode === StoryMode.DYNAMIC;
  if (input.relationshipDynamicsEnabled !== expectedDynamics) {
    throw new TypeError(
      "storyWorld.relationshipDynamicsEnabled must match storyWorld.storyMode",
    );
  }

  return {
    id: input.id,
    name: input.name,
    timezone: input.timezone,
    storyMode: input.storyMode,
    relationshipDynamicsEnabled: input.relationshipDynamicsEnabled,
  };
}
