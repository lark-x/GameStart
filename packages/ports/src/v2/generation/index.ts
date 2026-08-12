import type {
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
