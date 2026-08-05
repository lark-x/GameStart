import { assertRelationshipState, type RelationshipState } from "./relationship.ts";
import type { Character } from "./character.ts";
import type { StoryWorld } from "./story-world.ts";
import { assertNonEmptyString } from "./validation.ts";

export interface RelationshipEdgeInput {
  id: string;
  source: Character;
  target: Character;
  storyWorld: StoryWorld;
  relationshipType: string;
  initialState: RelationshipState;
  isPublic: boolean;
  isBidirectional: boolean;
}

export interface RelationshipEdge {
  id: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  storyWorldId: string;
  relationshipType: string;
  initialState: RelationshipState;
  isPublic: boolean;
  isBidirectional: boolean;
}

export function createRelationshipEdge(input: RelationshipEdgeInput): RelationshipEdge {
  assertNonEmptyString(input.id, "relationshipEdge.id");
  assertNonEmptyString(input.relationshipType, "relationshipEdge.relationshipType");

  if (input.source.id === input.target.id) {
    throw new TypeError("relationshipEdge.source and target cannot be the same character");
  }
  if (input.source.storyWorldId !== input.target.storyWorldId) {
    throw new TypeError("relationshipEdge.source and target must share a story world");
  }
  if (
    input.source.storyWorldId !== input.storyWorld.id ||
    input.target.storyWorldId !== input.storyWorld.id
  ) {
    throw new TypeError("relationshipEdge.characters must belong to storyWorld");
  }
  assertRelationshipState(input.initialState, "relationshipEdge.initialState");

  return {
    id: input.id,
    sourceCharacterId: input.source.id,
    targetCharacterId: input.target.id,
    storyWorldId: input.storyWorld.id,
    relationshipType: input.relationshipType,
    initialState: { ...input.initialState },
    isPublic: input.isPublic,
    isBidirectional: input.isBidirectional,
  };
}
