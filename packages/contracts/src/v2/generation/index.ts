import type {
  V2CandidateId,
  V2CharacterId,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2JobStatus,
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

export type V2GenerationJobKind = "scene";
export type V2GenerationDispatchStatus = "pending" | "enqueued";

export interface V2SceneGenerationJobRecord {
  readonly jobId: V2JobId;
  readonly storyWorldId: V2StoryWorldId;
  readonly kind: V2GenerationJobKind;
  readonly status: V2JobStatus;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly baseCanonRevision: V2Revision;
  readonly contextHash: string;
  readonly context: V2GenerationContextSnapshot;
  readonly prompt: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly createdAt: V2IsoDateTime;
  readonly updatedAt: V2IsoDateTime;
  readonly claimedAt?: V2IsoDateTime;
  readonly leaseExpiresAt?: V2IsoDateTime;
  readonly completedAt?: V2IsoDateTime;
  readonly cancelledAt?: V2IsoDateTime;
  readonly candidateId?: V2CandidateId;
  readonly providerResponseId?: string;
  readonly rawOutputPreview?: string;
  readonly failureReason?: string;
}

export interface V2GenerationDispatchRecord {
  readonly dispatchId: string;
  readonly jobId: V2JobId;
  readonly status: V2GenerationDispatchStatus;
  readonly attempts: number;
  readonly requestedAt: V2IsoDateTime;
  readonly enqueuedAt?: V2IsoDateTime;
  readonly lastError?: string;
}

export interface V2CreateSceneGenerationJobInput {
  readonly jobId: V2JobId;
  readonly storyWorldId: V2StoryWorldId;
  readonly baseCanonRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly prompt: string;
  readonly context: V2GenerationContextSnapshot;
  readonly createdAt: V2IsoDateTime;
  readonly maxAttempts?: number;
}

export interface V2GenerationContextPreviewApiRequest {
  readonly storyWorldId: V2StoryWorldId;
  readonly baseCanonRevision: V2Revision;
  readonly prompt: string;
  readonly tokenBudget?: number;
}

export interface V2GenerationContextPreviewApiResponse {
  readonly context: V2GenerationContextSnapshot;
}

export interface V2CreateSceneGenerationJobApiRequest extends V2GenerationContextPreviewApiRequest {
  readonly idempotencyKey: V2IdempotencyKey;
  readonly maxAttempts?: number;
}

export interface V2CreateSceneGenerationJobApiResponse {
  readonly job: V2SceneGenerationJobRecord;
  readonly inserted: boolean;
}

export interface V2GenerationJobApiResponse {
  readonly job: V2SceneGenerationJobRecord;
}
