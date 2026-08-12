import type {
  V2CandidateEnvelope,
  V2CandidateId,
  V2CandidateStatus,
  V2IdempotencyKey,
  V2Revision,
  V2SceneCandidatePayload,
  V2StoryWorldId,
} from "../shared/index.ts";

export type V2CandidateReviewAction = "approve" | "reject" | "request_changes";

export type V2SceneCandidateDto = V2CandidateEnvelope<V2SceneCandidatePayload>;

export interface V2SubmitSceneCandidateRequest {
  readonly candidateId: V2CandidateId;
  readonly baseCanonRevision: V2Revision;
  readonly payload: V2SceneCandidatePayload;
  readonly provenance: V2SceneCandidateDto["provenance"];
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2ReviewCandidateRequest {
  readonly action: V2CandidateReviewAction;
  readonly reviewer: string;
  readonly reason?: string;
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2CandidateReviewAuditDto {
  readonly auditId: number;
  readonly candidateId: V2CandidateId;
  readonly storyWorldId: V2StoryWorldId;
  readonly fromStatus: V2CandidateStatus;
  readonly toStatus: V2CandidateStatus;
  readonly action: V2CandidateReviewAction;
  readonly reviewer: string;
  readonly reason?: string;
  readonly resultingRevision: V2Revision;
  readonly createdAt: string;
}

export interface V2CandidateReviewResponse {
  readonly candidate: V2SceneCandidateDto;
  readonly revision: V2Revision;
  readonly appliedSceneId?: V2SceneCandidatePayload["scene"]["sceneId"];
  readonly appliedChoiceIds: readonly string[];
}
