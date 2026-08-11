import type { RelationshipStateDto } from "./character.ts";
import { CharacterRole, StoryMode } from "./character.ts";
import type { ActorSessionId, CharacterId, RelationshipId, StoryWorldId } from "./ids.ts";


export interface StoryWorldDto {
  id: StoryWorldId;
  name: string;
  timezone: string;
  storyMode: StoryMode;
  relationshipDynamicsEnabled: boolean;
}

export interface CreateStoryWorldRequest {
  id: StoryWorldId;
  name: string;
  timezone: string;
  storyMode: StoryMode;
  relationshipDynamicsEnabled: boolean;
}

export interface UpdateStoryWorldRequest {
  name?: string;
  timezone?: string;
  storyMode?: StoryMode;
  relationshipDynamicsEnabled?: boolean;
}

export interface CreateCharacterRequest {
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

export interface UpdateCharacterRequest {
  displayName?: string;
  timezone?: string;
  birthDate?: string;
  personaPrompt?: string;
  personaPromptRef?: string;
  visualPromptRef?: string;
}

export interface RelationshipEdgeDto {
  id: RelationshipId;
  sourceCharacterId: CharacterId;
  targetCharacterId: CharacterId;
  storyWorldId: StoryWorldId;
  relationshipType: string;
  initialState: RelationshipStateDto;
  isPublic: boolean;
  isBidirectional: boolean;
}

export interface CreateRelationshipEdgeRequest {
  id: RelationshipId;
  sourceCharacterId: CharacterId;
  targetCharacterId: CharacterId;
  storyWorldId: StoryWorldId;
  relationshipType: string;
  initialState: RelationshipStateDto;
  isPublic: boolean;
  isBidirectional: boolean;
}

export interface UpdateRelationshipEdgeRequest {
  relationshipType?: string;
  initialState?: RelationshipStateDto;
  isPublic?: boolean;
  isBidirectional?: boolean;
}

export interface ActorSessionDto {
  id: ActorSessionId;
  storyWorldId: StoryWorldId;
  userCharacterId: CharacterId;
  startedAt: string;
  endedAt?: string;
}

export interface ActorSessionSwitchRequest {
  actorSessionId: ActorSessionId;
  nextCharacterId: CharacterId;
}
