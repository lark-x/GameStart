import type {
  V2CharacterId,
  V2IsoDateTime,
  V2Revision,
  V2SceneCandidatePayload,
  V2StoryWorldId,
} from "../shared/index.ts";

export interface V2GenerationContextFactRef {
  readonly id: string;
  readonly text: string;
  readonly visibility: "creator_only" | "player_visible";
}

export interface V2GenerationContextCharacterRef {
  readonly characterId: V2CharacterId;
  readonly name: string;
}

export interface V2GenerationContextSceneRef {
  readonly sceneId: string;
  readonly title: string;
}

export interface V2GenerationContextSnapshot {
  readonly storyWorldId: V2StoryWorldId;
  readonly baseCanonRevision: V2Revision;
  readonly requestedAt: V2IsoDateTime;
  readonly prompt: string;
  readonly promptPreview: string;
  readonly tokenBudget: number;
  readonly contextHash: string;
  readonly sourceFactIds: readonly string[];
  readonly sourceCharacterIds: readonly V2CharacterId[];
  readonly sourceSceneIds: readonly string[];
  readonly facts: readonly V2GenerationContextFactRef[];
  readonly characters: readonly V2GenerationContextCharacterRef[];
  readonly scenes: readonly V2GenerationContextSceneRef[];
}

export interface V2ParsedSceneCandidate {
  readonly payload: V2SceneCandidatePayload;
  readonly rawTextPreview: string;
}
