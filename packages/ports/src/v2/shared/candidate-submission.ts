import type {
  V2CandidateEnvelope,
  V2CandidateId,
  V2CandidateStatus,
  V2IdempotencyKey,
  V2SceneCandidatePayload,
} from "@living-network/contracts";

export interface CandidateSubmissionPort {
  submitSceneCandidate(input: {
    readonly candidate: V2CandidateEnvelope<V2SceneCandidatePayload>;
    readonly idempotencyKey: V2IdempotencyKey;
  }): Promise<{
    readonly candidateId: V2CandidateId;
    readonly status: V2CandidateStatus;
  }>;
}
