import type { DatabaseSync } from "node:sqlite";

import type {
  V2CandidateId,
  V2CreateSceneGenerationJobInput,
  V2GenerationContextSnapshot,
  V2GenerationDispatchRecord,
  V2GenerationDispatchStatus,
  V2GenerationJobKind,
  V2SceneGenerationJobRecord,
} from "@living-network/contracts";
import type { V2IdempotencyKey, V2IsoDateTime, V2JobId, V2JobStatus, V2Revision, V2StoryWorldId } from "@living-network/contracts";
import type {
  V2GenerationDispatchRepository,
  V2GenerationJobCreateResult,
  V2GenerationJobRepository,
} from "@living-network/ports";
import { withV2SqliteTransaction } from "../platform/index.ts";

type JobRow = {
  job_id: string;
  story_world_id: string;
  kind: string;
  status: string;
  idempotency_key: string;
  base_canon_revision: number;
  context_hash: string;
  context_json: string;
  prompt: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  lease_expires_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  candidate_id: string | null;
  provider_response_id: string | null;
  raw_output_preview: string | null;
  failure_reason: string | null;
};

type DispatchRow = {
  dispatch_id: string;
  job_id: string;
  status: string;
  attempts: number;
  requested_at: string;
  enqueued_at: string | null;
  last_error: string | null;
};

function parseContext(value: string): V2GenerationContextSnapshot {
  return JSON.parse(value) as V2GenerationContextSnapshot;
}

function mapJob(row: JobRow): V2SceneGenerationJobRecord {
  const job: {
    -readonly [K in keyof V2SceneGenerationJobRecord]: V2SceneGenerationJobRecord[K];
  } = {
    jobId: row.job_id as V2JobId,
    storyWorldId: row.story_world_id as V2StoryWorldId,
    kind: row.kind as V2GenerationJobKind,
    status: row.status as V2JobStatus,
    idempotencyKey: row.idempotency_key as V2IdempotencyKey,
    baseCanonRevision: row.base_canon_revision as V2Revision,
    contextHash: row.context_hash,
    context: parseContext(row.context_json),
    prompt: row.prompt,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at as V2IsoDateTime,
    updatedAt: row.updated_at as V2IsoDateTime,
  };
  if (row.claimed_at !== null) job.claimedAt = row.claimed_at as V2IsoDateTime;
  if (row.lease_expires_at !== null) job.leaseExpiresAt = row.lease_expires_at as V2IsoDateTime;
  if (row.completed_at !== null) job.completedAt = row.completed_at as V2IsoDateTime;
  if (row.cancelled_at !== null) job.cancelledAt = row.cancelled_at as V2IsoDateTime;
  if (row.candidate_id !== null) job.candidateId = row.candidate_id as V2CandidateId;
  if (row.provider_response_id !== null) job.providerResponseId = row.provider_response_id;
  if (row.raw_output_preview !== null) job.rawOutputPreview = row.raw_output_preview;
  if (row.failure_reason !== null) job.failureReason = row.failure_reason;
  return job;
}

function mapDispatch(row: DispatchRow): V2GenerationDispatchRecord {
  const dispatch: {
    -readonly [K in keyof V2GenerationDispatchRecord]: V2GenerationDispatchRecord[K];
  } = {
    dispatchId: row.dispatch_id,
    jobId: row.job_id as V2JobId,
    status: row.status as V2GenerationDispatchStatus,
    attempts: row.attempts,
    requestedAt: row.requested_at as V2IsoDateTime,
  };
  if (row.enqueued_at !== null) dispatch.enqueuedAt = row.enqueued_at as V2IsoDateTime;
  if (row.last_error !== null) dispatch.lastError = row.last_error;
  return dispatch;
}

function getJobOrThrow(db: DatabaseSync, jobId: V2JobId): V2SceneGenerationJobRecord {
  const row = db.prepare("SELECT * FROM v2_generation_jobs WHERE job_id = ?").get(jobId) as JobRow | undefined;
  if (row === undefined) throw new Error(`V2 generation job not found: ${jobId}`);
  return mapJob(row);
}

function sameJobPayload(existing: V2SceneGenerationJobRecord, input: V2CreateSceneGenerationJobInput): boolean {
  return existing.storyWorldId === input.storyWorldId &&
    existing.baseCanonRevision === input.baseCanonRevision &&
    existing.prompt === input.prompt &&
    existing.contextHash === input.context.contextHash &&
    existing.idempotencyKey === input.idempotencyKey;
}

export class V2SqliteGenerationJobRepository implements V2GenerationJobRepository, V2GenerationDispatchRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async createSceneJob(input: V2CreateSceneGenerationJobInput): Promise<V2GenerationJobCreateResult> {
    return withV2SqliteTransaction(this.db, () => {
      const existing = this.db.prepare(
        "SELECT * FROM v2_generation_jobs WHERE story_world_id = ? AND idempotency_key = ?",
      ).get(input.storyWorldId, input.idempotencyKey) as JobRow | undefined;
      if (existing !== undefined) {
        const job = mapJob(existing);
        if (!sameJobPayload(job, input)) throw new Error("V2 generation job idempotency key conflict");
        return { job, inserted: false };
      }
      const maxAttempts = input.maxAttempts ?? 3;
      this.db.prepare(`
        INSERT INTO v2_generation_jobs (
          job_id, story_world_id, kind, status, idempotency_key, base_canon_revision,
          context_hash, context_json, prompt, attempts, max_attempts, created_at, updated_at
        ) VALUES (?, ?, 'scene', 'queued', ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).run(
        input.jobId,
        input.storyWorldId,
        input.idempotencyKey,
        input.baseCanonRevision,
        input.context.contextHash,
        JSON.stringify(input.context),
        input.prompt,
        maxAttempts,
        input.createdAt,
        input.createdAt,
      );
      this.db.prepare(`
        INSERT INTO v2_generation_dispatches (dispatch_id, job_id, status, attempts, requested_at)
        VALUES (?, ?, 'pending', 0, ?)
      `).run(`generation-dispatch:${input.jobId}`, input.jobId, input.createdAt);
      return { job: getJobOrThrow(this.db, input.jobId), inserted: true };
    });
  }

  public async getJob(jobId: V2JobId): Promise<V2SceneGenerationJobRecord | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_generation_jobs WHERE job_id = ?").get(jobId) as JobRow | undefined;
    return row === undefined ? undefined : mapJob(row);
  }

  public async listJobsByStatus(status: V2JobStatus, limit: number): Promise<readonly V2SceneGenerationJobRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM v2_generation_jobs WHERE status = ? ORDER BY updated_at ASC LIMIT ?",
    ).all(status, limit) as JobRow[];
    return rows.map(mapJob);
  }

  public async markJobClaimed(input: { readonly jobId: V2JobId; readonly claimedAt: string; readonly leaseExpiresAt: string }): Promise<V2SceneGenerationJobRecord> {
    this.db.prepare(`
      UPDATE v2_generation_jobs
      SET status = 'claimed', claimed_at = ?, lease_expires_at = ?, updated_at = ?
      WHERE job_id = ? AND status = 'queued'
    `).run(input.claimedAt, input.leaseExpiresAt, input.claimedAt, input.jobId);
    return getJobOrThrow(this.db, input.jobId);
  }

  public async markJobRunning(input: { readonly jobId: V2JobId; readonly updatedAt: string }): Promise<V2SceneGenerationJobRecord> {
    this.db.prepare("UPDATE v2_generation_jobs SET status = 'running', updated_at = ? WHERE job_id = ? AND status = 'claimed'")
      .run(input.updatedAt, input.jobId);
    return getJobOrThrow(this.db, input.jobId);
  }

  public async recoverExpiredJobLease(input: { readonly jobId: V2JobId; readonly recoveredAt: string }): Promise<V2SceneGenerationJobRecord> {
    this.db.prepare(`
      UPDATE v2_generation_jobs
      SET status = 'queued', claimed_at = NULL, lease_expires_at = NULL, updated_at = ?,
          failure_reason = 'lease expired before worker completion'
      WHERE job_id = ?
        AND status IN ('claimed', 'running')
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= ?
    `).run(input.recoveredAt, input.jobId, input.recoveredAt);
    return getJobOrThrow(this.db, input.jobId);
  }

  public async markJobSucceeded(input: { readonly jobId: V2JobId; readonly completedAt: string; readonly candidateId: string; readonly providerResponseId: string; readonly rawOutputPreview: string }): Promise<V2SceneGenerationJobRecord> {
    this.db.prepare(`
      UPDATE v2_generation_jobs
      SET status = 'succeeded', completed_at = ?, updated_at = ?, candidate_id = ?,
          provider_response_id = ?, raw_output_preview = ?, failure_reason = NULL
      WHERE job_id = ? AND status = 'running'
    `).run(input.completedAt, input.completedAt, input.candidateId, input.providerResponseId, input.rawOutputPreview, input.jobId);
    return getJobOrThrow(this.db, input.jobId);
  }

  public async markJobFailed(input: { readonly jobId: V2JobId; readonly failedAt: string; readonly reason: string; readonly retryable: boolean }): Promise<V2SceneGenerationJobRecord> {
    const current = getJobOrThrow(this.db, input.jobId);
    const attempts = current.attempts + 1;
    const retry = input.retryable && attempts < current.maxAttempts;
    const status: V2JobStatus = retry ? "queued" : "failed";
    this.db.prepare(`
      UPDATE v2_generation_jobs
      SET status = ?, attempts = ?, updated_at = ?, failure_reason = ?,
          claimed_at = NULL, lease_expires_at = NULL
      WHERE job_id = ?
    `).run(status, attempts, input.failedAt, input.reason.slice(0, 2048), input.jobId);
    if (retry) {
      this.db.prepare(`
        UPDATE v2_generation_dispatches
        SET status = 'pending', last_error = ?
        WHERE job_id = ?
      `).run(input.reason.slice(0, 2048), input.jobId);
    }
    return getJobOrThrow(this.db, input.jobId);
  }

  public async cancelJob(input: { readonly jobId: V2JobId; readonly cancelledAt: string; readonly reason?: string }): Promise<V2SceneGenerationJobRecord> {
    this.db.prepare(`
      UPDATE v2_generation_jobs
      SET status = 'cancelled', cancelled_at = ?, updated_at = ?, failure_reason = ?
      WHERE job_id = ? AND status IN ('queued', 'claimed', 'running')
    `).run(input.cancelledAt, input.cancelledAt, input.reason ?? null, input.jobId);
    return getJobOrThrow(this.db, input.jobId);
  }

  public async listPendingDispatches(limit: number): Promise<readonly V2GenerationDispatchRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM v2_generation_dispatches WHERE status = 'pending' ORDER BY requested_at ASC LIMIT ?",
    ).all(limit) as DispatchRow[];
    return rows.map(mapDispatch);
  }

  public async markDispatchEnqueued(input: { readonly dispatchId: string; readonly enqueuedAt: string }): Promise<V2GenerationDispatchRecord> {
    this.db.prepare(`
      UPDATE v2_generation_dispatches
      SET status = 'enqueued', enqueued_at = ?, last_error = NULL
      WHERE dispatch_id = ?
    `).run(input.enqueuedAt, input.dispatchId);
    const row = this.db.prepare("SELECT * FROM v2_generation_dispatches WHERE dispatch_id = ?").get(input.dispatchId) as DispatchRow | undefined;
    if (row === undefined) throw new Error(`V2 generation dispatch not found: ${input.dispatchId}`);
    return mapDispatch(row);
  }

  public async recordDispatchFailure(input: { readonly dispatchId: string; readonly error: string }): Promise<V2GenerationDispatchRecord> {
    this.db.prepare(`
      UPDATE v2_generation_dispatches
      SET status = 'pending', attempts = attempts + 1, last_error = ?
      WHERE dispatch_id = ?
    `).run(input.error.slice(0, 2048), input.dispatchId);
    const row = this.db.prepare("SELECT * FROM v2_generation_dispatches WHERE dispatch_id = ?").get(input.dispatchId) as DispatchRow | undefined;
    if (row === undefined) throw new Error(`V2 generation dispatch not found: ${input.dispatchId}`);
    return mapDispatch(row);
  }
}
