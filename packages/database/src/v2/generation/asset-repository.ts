import type { DatabaseSync } from "node:sqlite";

import type {
  V2AssetCandidatePayload,
  V2AssetCandidateRecord,
  V2AssetCandidateStatus,
  V2AssetGenerationJobRecord,
  V2CandidateId,
  V2CreateAssetGenerationJobInput,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2JobStatus,
  V2StoryWorldId,
} from "@living-network/contracts";
import type {
  V2AssetCandidateRepository,
  V2AssetGenerationJobCreateResult,
  V2AssetGenerationJobRepository,
} from "@living-network/ports";
import { withV2SqliteTransaction } from "../platform/index.ts";

type AssetJobRow = {
  job_id: string;
  story_world_id: string;
  status: string;
  idempotency_key: string;
  prompt: string;
  negative_prompt: string | null;
  workflow_version: string;
  workflow_json: string;
  seed: number | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  lease_expires_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  external_job_id: string | null;
  media_ref: string | null;
  candidate_id: string | null;
  failure_reason: string | null;
};

type AssetCandidateRow = {
  candidate_id: string;
  job_id: string;
  story_world_id: string;
  status: string;
  payload_json: string;
  created_at: string;
  reviewed_at: string | null;
  reviewer: string | null;
  review_reason: string | null;
};

function parseRecord(value: string): Record<string, unknown> {
  return JSON.parse(value) as Record<string, unknown>;
}

function parsePayload(value: string): V2AssetCandidatePayload {
  return JSON.parse(value) as V2AssetCandidatePayload;
}

function mapAssetJob(row: AssetJobRow): V2AssetGenerationJobRecord {
  const job: {
    -readonly [K in keyof V2AssetGenerationJobRecord]: V2AssetGenerationJobRecord[K];
  } = {
    jobId: row.job_id as V2JobId,
    storyWorldId: row.story_world_id as V2StoryWorldId,
    status: row.status as V2JobStatus,
    idempotencyKey: row.idempotency_key as V2IdempotencyKey,
    prompt: row.prompt,
    workflowVersion: row.workflow_version,
    workflow: parseRecord(row.workflow_json),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at as V2IsoDateTime,
    updatedAt: row.updated_at as V2IsoDateTime,
  };
  if (row.negative_prompt !== null) job.negativePrompt = row.negative_prompt;
  if (row.seed !== null) job.seed = row.seed;
  if (row.claimed_at !== null) job.claimedAt = row.claimed_at as V2IsoDateTime;
  if (row.lease_expires_at !== null) job.leaseExpiresAt = row.lease_expires_at as V2IsoDateTime;
  if (row.submitted_at !== null) job.submittedAt = row.submitted_at as V2IsoDateTime;
  if (row.completed_at !== null) job.completedAt = row.completed_at as V2IsoDateTime;
  if (row.cancelled_at !== null) job.cancelledAt = row.cancelled_at as V2IsoDateTime;
  if (row.external_job_id !== null) job.externalJobId = row.external_job_id;
  if (row.media_ref !== null) job.mediaRef = row.media_ref;
  if (row.candidate_id !== null) job.candidateId = row.candidate_id as V2CandidateId;
  if (row.failure_reason !== null) job.failureReason = row.failure_reason;
  return job;
}

function mapAssetCandidate(row: AssetCandidateRow): V2AssetCandidateRecord {
  const candidate: {
    -readonly [K in keyof V2AssetCandidateRecord]: V2AssetCandidateRecord[K];
  } = {
    candidateId: row.candidate_id as V2CandidateId,
    jobId: row.job_id as V2JobId,
    storyWorldId: row.story_world_id as V2StoryWorldId,
    status: row.status as V2AssetCandidateStatus,
    payload: parsePayload(row.payload_json),
    createdAt: row.created_at as V2IsoDateTime,
  };
  if (row.reviewed_at !== null) candidate.reviewedAt = row.reviewed_at as V2IsoDateTime;
  if (row.reviewer !== null) candidate.reviewer = row.reviewer;
  if (row.review_reason !== null) candidate.reviewReason = row.review_reason;
  return candidate;
}

function getAssetJobOrThrow(db: DatabaseSync, jobId: V2JobId): V2AssetGenerationJobRecord {
  const row = db.prepare("SELECT * FROM v2_asset_generation_jobs WHERE job_id = ?").get(jobId) as AssetJobRow | undefined;
  if (row === undefined) throw new Error(`V2 asset generation job not found: ${jobId}`);
  return mapAssetJob(row);
}

function getAssetCandidateRow(db: DatabaseSync, candidateId: V2CandidateId): AssetCandidateRow | undefined {
  return db.prepare("SELECT * FROM v2_asset_candidates WHERE candidate_id = ?").get(candidateId) as AssetCandidateRow | undefined;
}

function sameAssetJobPayload(existing: V2AssetGenerationJobRecord, input: V2CreateAssetGenerationJobInput): boolean {
  return existing.storyWorldId === input.storyWorldId &&
    existing.idempotencyKey === input.idempotencyKey &&
    existing.prompt === input.prompt &&
    existing.workflowVersion === input.workflowVersion &&
    JSON.stringify(existing.workflow) === JSON.stringify(input.workflow) &&
    existing.negativePrompt === input.negativePrompt &&
    existing.seed === input.seed;
}

function sameCandidate(existing: V2AssetCandidateRecord, input: V2AssetCandidateRecord): boolean {
  return existing.jobId === input.jobId &&
    existing.storyWorldId === input.storyWorldId &&
    existing.status === input.status &&
    JSON.stringify(existing.payload) === JSON.stringify(input.payload);
}

export class V2SqliteAssetGenerationRepository implements V2AssetGenerationJobRepository, V2AssetCandidateRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async createAssetJob(input: V2CreateAssetGenerationJobInput): Promise<V2AssetGenerationJobCreateResult> {
    return withV2SqliteTransaction(this.db, () => {
      const existing = this.db.prepare(
        "SELECT * FROM v2_asset_generation_jobs WHERE story_world_id = ? AND idempotency_key = ?",
      ).get(input.storyWorldId, input.idempotencyKey) as AssetJobRow | undefined;
      if (existing !== undefined) {
        const job = mapAssetJob(existing);
        if (!sameAssetJobPayload(job, input)) throw new Error("V2 asset generation job idempotency key conflict");
        return { job, inserted: false };
      }
      const maxAttempts = input.maxAttempts ?? 3;
      this.db.prepare(`
        INSERT INTO v2_asset_generation_jobs (
          job_id, story_world_id, status, idempotency_key, prompt, negative_prompt,
          workflow_version, workflow_json, seed, attempts, max_attempts, created_at, updated_at
        ) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).run(
        input.jobId,
        input.storyWorldId,
        input.idempotencyKey,
        input.prompt,
        input.negativePrompt ?? null,
        input.workflowVersion,
        JSON.stringify(input.workflow),
        input.seed ?? null,
        maxAttempts,
        input.createdAt,
        input.createdAt,
      );
      this.db.prepare(`
        INSERT INTO v2_asset_generation_dispatches (dispatch_id, job_id, status, attempts, requested_at)
        VALUES (?, ?, 'pending', 0, ?)
      `).run(`asset-dispatch:${input.jobId}`, input.jobId, input.createdAt);
      return { job: getAssetJobOrThrow(this.db, input.jobId), inserted: true };
    });
  }

  public async getAssetJob(jobId: V2JobId): Promise<V2AssetGenerationJobRecord | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_asset_generation_jobs WHERE job_id = ?").get(jobId) as AssetJobRow | undefined;
    return row === undefined ? undefined : mapAssetJob(row);
  }

  public async listAssetJobsByStatus(status: V2JobStatus, limit: number): Promise<readonly V2AssetGenerationJobRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM v2_asset_generation_jobs WHERE status = ? ORDER BY updated_at ASC LIMIT ?",
    ).all(status, limit) as AssetJobRow[];
    return rows.map(mapAssetJob);
  }

  public async markAssetJobClaimed(input: { readonly jobId: V2JobId; readonly claimedAt: string; readonly leaseExpiresAt: string }): Promise<V2AssetGenerationJobRecord> {
    this.db.prepare(`
      UPDATE v2_asset_generation_jobs
      SET status = 'claimed', claimed_at = ?, lease_expires_at = ?, updated_at = ?
      WHERE job_id = ? AND status = 'queued'
    `).run(input.claimedAt, input.leaseExpiresAt, input.claimedAt, input.jobId);
    return getAssetJobOrThrow(this.db, input.jobId);
  }

  public async markAssetJobRunning(input: { readonly jobId: V2JobId; readonly updatedAt: string }): Promise<V2AssetGenerationJobRecord> {
    this.db.prepare("UPDATE v2_asset_generation_jobs SET status = 'running', updated_at = ? WHERE job_id = ? AND status = 'claimed'")
      .run(input.updatedAt, input.jobId);
    return getAssetJobOrThrow(this.db, input.jobId);
  }

  public async markAssetJobSubmitted(input: { readonly jobId: V2JobId; readonly submittedAt: string; readonly externalJobId: string }): Promise<V2AssetGenerationJobRecord> {
    this.db.prepare(`
      UPDATE v2_asset_generation_jobs
      SET submitted_at = ?, updated_at = ?, external_job_id = ?
      WHERE job_id = ? AND status = 'running'
    `).run(input.submittedAt, input.submittedAt, input.externalJobId, input.jobId);
    return getAssetJobOrThrow(this.db, input.jobId);
  }

  public async recoverExpiredAssetJobLease(input: { readonly jobId: V2JobId; readonly recoveredAt: string }): Promise<V2AssetGenerationJobRecord> {
    this.db.prepare(`
      UPDATE v2_asset_generation_jobs
      SET status = 'queued', claimed_at = NULL, lease_expires_at = NULL, updated_at = ?,
          failure_reason = 'lease expired before asset worker completion'
      WHERE job_id = ?
        AND status IN ('claimed', 'running')
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= ?
    `).run(input.recoveredAt, input.jobId, input.recoveredAt);
    return getAssetJobOrThrow(this.db, input.jobId);
  }

  public async markAssetJobSucceeded(input: { readonly jobId: V2JobId; readonly completedAt: string; readonly mediaRef: string; readonly candidateId: string }): Promise<V2AssetGenerationJobRecord> {
    this.db.prepare(`
      UPDATE v2_asset_generation_jobs
      SET status = 'succeeded', completed_at = ?, updated_at = ?, media_ref = ?,
          candidate_id = ?, failure_reason = NULL
      WHERE job_id = ? AND status = 'running'
    `).run(input.completedAt, input.completedAt, input.mediaRef, input.candidateId, input.jobId);
    return getAssetJobOrThrow(this.db, input.jobId);
  }

  public async markAssetJobFailed(input: { readonly jobId: V2JobId; readonly failedAt: string; readonly reason: string; readonly retryable: boolean }): Promise<V2AssetGenerationJobRecord> {
    const current = getAssetJobOrThrow(this.db, input.jobId);
    const attempts = current.attempts + 1;
    const retry = input.retryable && attempts < current.maxAttempts;
    const status: V2JobStatus = retry ? "queued" : "failed";
    this.db.prepare(`
      UPDATE v2_asset_generation_jobs
      SET status = ?, attempts = ?, updated_at = ?, failure_reason = ?,
          claimed_at = NULL, lease_expires_at = NULL
      WHERE job_id = ?
    `).run(status, attempts, input.failedAt, input.reason.slice(0, 2048), input.jobId);
    if (retry) {
      this.db.prepare(`
        UPDATE v2_asset_generation_dispatches
        SET status = 'pending', last_error = ?
        WHERE job_id = ?
      `).run(input.reason.slice(0, 2048), input.jobId);
    }
    return getAssetJobOrThrow(this.db, input.jobId);
  }

  public async cancelAssetJob(input: { readonly jobId: V2JobId; readonly cancelledAt: string; readonly reason?: string }): Promise<V2AssetGenerationJobRecord> {
    this.db.prepare(`
      UPDATE v2_asset_generation_jobs
      SET status = 'cancelled', cancelled_at = ?, updated_at = ?, failure_reason = ?
      WHERE job_id = ? AND status IN ('queued', 'claimed', 'running')
    `).run(input.cancelledAt, input.cancelledAt, input.reason ?? null, input.jobId);
    return getAssetJobOrThrow(this.db, input.jobId);
  }

  public async createAssetCandidate(input: V2AssetCandidateRecord): Promise<{ readonly candidate: V2AssetCandidateRecord; readonly inserted: boolean }> {
    return withV2SqliteTransaction(this.db, () => {
      const existing = getAssetCandidateRow(this.db, input.candidateId);
      if (existing !== undefined) {
        const candidate = mapAssetCandidate(existing);
        if (!sameCandidate(candidate, input)) throw new Error("V2 asset candidate idempotency key conflict");
        return { candidate, inserted: false };
      }
      this.db.prepare(`
        INSERT INTO v2_asset_candidates (
          candidate_id, job_id, story_world_id, status, payload_json, created_at,
          reviewed_at, reviewer, review_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.candidateId,
        input.jobId,
        input.storyWorldId,
        input.status,
        JSON.stringify(input.payload),
        input.createdAt,
        input.reviewedAt ?? null,
        input.reviewer ?? null,
        input.reviewReason ?? null,
      );
      const inserted = getAssetCandidateRow(this.db, input.candidateId);
      if (inserted === undefined) throw new Error(`V2 asset candidate not found after insert: ${input.candidateId}`);
      return { candidate: mapAssetCandidate(inserted), inserted: true };
    });
  }

  public async getAssetCandidate(candidateId: V2CandidateId): Promise<V2AssetCandidateRecord | undefined> {
    const row = getAssetCandidateRow(this.db, candidateId);
    return row === undefined ? undefined : mapAssetCandidate(row);
  }
}
