import type {
  V2AssetCandidateRecord,
  V2AssetGenerationJobRecord,
  V2CandidateId,
  V2CreateAssetGenerationJobInput,
  V2CreateSceneGenerationJobInput,
  V2GenerationDispatchRecord,
  V2GenerationJobKind,
  V2SceneGenerationJobRecord,
} from "@living-network/contracts";
import type { V2JobId, V2JobStatus } from "@living-network/contracts";

export interface V2GenerationJobCreateResult {
  readonly job: V2SceneGenerationJobRecord;
  readonly inserted: boolean;
}

export interface V2GenerationJobRepository {
  createSceneJob(input: V2CreateSceneGenerationJobInput): Promise<V2GenerationJobCreateResult>;
  getJob(jobId: V2JobId): Promise<V2SceneGenerationJobRecord | undefined>;
  listJobsByStatus(status: V2JobStatus, limit: number): Promise<readonly V2SceneGenerationJobRecord[]>;
  markJobClaimed(input: { readonly jobId: V2JobId; readonly claimedAt: string; readonly leaseExpiresAt: string }): Promise<V2SceneGenerationJobRecord>;
  markJobRunning(input: { readonly jobId: V2JobId; readonly updatedAt: string }): Promise<V2SceneGenerationJobRecord>;
  recoverExpiredJobLease(input: { readonly jobId: V2JobId; readonly recoveredAt: string }): Promise<V2SceneGenerationJobRecord>;
  markJobSucceeded(input: { readonly jobId: V2JobId; readonly completedAt: string; readonly candidateId: string; readonly providerResponseId: string; readonly rawOutputPreview: string }): Promise<V2SceneGenerationJobRecord>;
  markJobFailed(input: { readonly jobId: V2JobId; readonly failedAt: string; readonly reason: string; readonly retryable: boolean }): Promise<V2SceneGenerationJobRecord>;
  cancelJob(input: { readonly jobId: V2JobId; readonly cancelledAt: string; readonly reason?: string }): Promise<V2SceneGenerationJobRecord>;
}

export interface V2GenerationDispatchRepository {
  listPendingDispatches(limit: number): Promise<readonly V2GenerationDispatchRecord[]>;
  markDispatchEnqueued(input: { readonly dispatchId: string; readonly enqueuedAt: string }): Promise<V2GenerationDispatchRecord>;
  recordDispatchFailure(input: { readonly dispatchId: string; readonly error: string }): Promise<V2GenerationDispatchRecord>;
}

export interface V2GenerationJobQueuePayload {
  readonly jobId: V2JobId;
  readonly kind: V2GenerationJobKind;
  readonly contextHash: string;
  readonly correlationId: string;
}

export interface V2AssetGenerationJobCreateResult {
  readonly job: V2AssetGenerationJobRecord;
  readonly inserted: boolean;
}

export interface V2AssetGenerationJobRepository {
  createAssetJob(input: V2CreateAssetGenerationJobInput): Promise<V2AssetGenerationJobCreateResult>;
  getAssetJob(jobId: V2JobId): Promise<V2AssetGenerationJobRecord | undefined>;
  listAssetJobsByStatus(status: V2JobStatus, limit: number): Promise<readonly V2AssetGenerationJobRecord[]>;
  markAssetJobClaimed(input: { readonly jobId: V2JobId; readonly claimedAt: string; readonly leaseExpiresAt: string }): Promise<V2AssetGenerationJobRecord>;
  markAssetJobRunning(input: { readonly jobId: V2JobId; readonly updatedAt: string }): Promise<V2AssetGenerationJobRecord>;
  markAssetJobSubmitted(input: { readonly jobId: V2JobId; readonly submittedAt: string; readonly externalJobId: string }): Promise<V2AssetGenerationJobRecord>;
  recoverExpiredAssetJobLease(input: { readonly jobId: V2JobId; readonly recoveredAt: string }): Promise<V2AssetGenerationJobRecord>;
  markAssetJobSucceeded(input: { readonly jobId: V2JobId; readonly completedAt: string; readonly mediaRef: string; readonly candidateId: string }): Promise<V2AssetGenerationJobRecord>;
  markAssetJobFailed(input: { readonly jobId: V2JobId; readonly failedAt: string; readonly reason: string; readonly retryable: boolean }): Promise<V2AssetGenerationJobRecord>;
  cancelAssetJob(input: { readonly jobId: V2JobId; readonly cancelledAt: string; readonly reason?: string }): Promise<V2AssetGenerationJobRecord>;
}

export interface V2AssetCandidateRepository {
  createAssetCandidate(input: V2AssetCandidateRecord): Promise<{ readonly candidate: V2AssetCandidateRecord; readonly inserted: boolean }>;
  getAssetCandidate(candidateId: V2CandidateId): Promise<V2AssetCandidateRecord | undefined>;
}

export interface V2AssetGenerationJobQueuePayload {
  readonly jobId: V2JobId;
  readonly kind: "asset";
  readonly workflowVersion: string;
  readonly correlationId: string;
}
