import type { V2JobRef } from "./job.ts";
import type {
  V2CandidateEnvelope,
  V2CandidateStatus,
  V2SceneCandidatePayload,
} from "./candidate.ts";
import type {
  V2CandidateId,
  V2IdempotencyKey,
  V2Revision,
  V2StoryWorldId,
} from "./primitives.ts";

export interface V2HealthResponse {
  readonly ok: true;
  readonly version: "v2";
}

export interface V2CreateSceneGenerationJobRequest {
  readonly storyWorldId: V2StoryWorldId;
  readonly baseCanonRevision: V2Revision;
  readonly prompt: string;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2CreateSceneGenerationJobResponse {
  readonly job: V2JobRef;
}

export interface V2SubmitCandidateRequest {
  readonly candidate: V2CandidateEnvelope<V2SceneCandidatePayload>;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2SubmitCandidateResponse {
  readonly candidateId: V2CandidateId;
  readonly status: V2CandidateStatus;
}

export interface V2ReleasePreflightResponse {
  readonly storyWorldId: V2StoryWorldId;
  readonly revision: V2Revision;
  readonly valid: boolean;
  readonly issues: readonly string[];
}
