import type {
  V2CharacterId,
  V2IdempotencyKey,
  V2LocationId,
  V2Revision,
  V2SceneId,
  V2StoryWorldId,
} from "../shared/index.ts";

export type V2NarrativeReferenceSourceType =
  | "arc"
  | "chapter"
  | "quest"
  | "scene"
  | "scene_block";

export type V2NarrativeReferenceTargetType =
  | "character"
  | "location"
  | "lore"
  | "timeline_event"
  | "fact"
  | "rule";

export type V2NarrativeReferenceRole =
  | "participant"
  | "speaker"
  | "location"
  | "mentioned"
  | "subject"
  | "affected"
  | "related"
  | "prerequisite";

export interface V2NarrativeReference {
  readonly referenceId: string;
  readonly storyWorldId: V2StoryWorldId;
  readonly sourceType: V2NarrativeReferenceSourceType;
  readonly sourceId: string;
  readonly targetType: V2NarrativeReferenceTargetType;
  readonly targetId: string;
  readonly role: V2NarrativeReferenceRole;
  readonly createdAt?: string;
}

export interface V2NarrativeReferenceItemInput {
  readonly targetType: V2NarrativeReferenceTargetType;
  readonly targetId: string;
  readonly role: V2NarrativeReferenceRole;
}

export interface V2SceneReferencesDto {
  readonly sceneId: V2SceneId;
  readonly storyWorldId: V2StoryWorldId;
  readonly mainLocationId?: V2LocationId;
  readonly participantCharacterIds: readonly V2CharacterId[];
  readonly references: readonly V2NarrativeReference[];
}

export interface V2ReplaceSceneReferencesRequest {
  readonly mainLocationId?: V2LocationId | null;
  readonly participantCharacterIds?: readonly V2CharacterId[];
  readonly references?: readonly V2NarrativeReferenceItemInput[];
  readonly expectedRevision?: V2Revision;
  readonly idempotencyKey?: V2IdempotencyKey;
}

export interface V2ReplaceSceneReferencesResponse {
  readonly references: V2SceneReferencesDto;
  readonly revision: V2Revision;
}
