import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  V2ApprovedAssetRecord,
  V2AssetCandidateReviewRecord,
  V2AssetCandidatePayload,
  V2AssetCandidateRecord,
  V2AssetCandidateStatus,
  V2AssetId,
  V2AssetGenerationJobRecord,
  V2CandidateId,
  V2CreateAssetGenerationJobInput,
  V2CreateManualAssetInput,
  V2GenerationDispatchRecord,
  V2GenerationDispatchStatus,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2JobStatus,
  V2ReleaseId,
  V2ReviewAssetCandidateInput,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type { V2ReviewAction, V2ReviewStatus } from "@living-network/domain/v2";
import { assertV2ReviewTransition } from "@living-network/domain/v2";
import type {
  V2ApprovedAssetRef,
  V2AssetCandidateRepository,
  V2AssetCandidateReviewResult,
  V2AssetGenerationDispatchRepository,
  V2AssetGenerationJobCreateResult,
  V2AssetGenerationJobRepository,
  V2AssetReviewRepository,
} from "@living-network/ports/v2";
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

type AssetCandidateReviewRow = {
  review_id: string;
  candidate_id: string;
  action: string;
  resulting_status: string;
  reviewed_at: string;
  idempotency_key: string;
  reviewer: string | null;
  reason: string | null;
};

type ApprovedAssetRow = {
  asset_id: string;
  story_world_id: string;
  source_type: "manual" | "candidate";
  candidate_id: string | null;
  title: string;
  media_ref: string;
  content_hash: string;
  original_filename: string | null;
  mime_type: string | null;
  byte_size: number | null;
  approved_at: string;
  reviewer: string | null;
  review_reason: string | null;
  release_id: string | null;
};

type AssetDispatchRow = {
  dispatch_id: string;
  job_id: string;
  status: string;
  attempts: number;
  requested_at: string;
  enqueued_at: string | null;
  last_error: string | null;
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

function mapReview(row: AssetCandidateReviewRow): V2AssetCandidateReviewRecord {
  const review: {
    -readonly [K in keyof V2AssetCandidateReviewRecord]: V2AssetCandidateReviewRecord[K];
  } = {
    reviewId: row.review_id,
    candidateId: row.candidate_id as V2CandidateId,
    action: row.action as V2AssetCandidateReviewRecord["action"],
    resultingStatus: row.resulting_status as V2AssetCandidateStatus,
    reviewedAt: row.reviewed_at as V2IsoDateTime,
    idempotencyKey: row.idempotency_key as V2IdempotencyKey,
  };
  if (row.reviewer !== null) review.reviewer = row.reviewer;
  if (row.reason !== null) review.reason = row.reason;
  return review;
}

function mapApprovedAsset(row: ApprovedAssetRow): V2ApprovedAssetRecord {
  const asset: {
    -readonly [K in keyof V2ApprovedAssetRecord]: V2ApprovedAssetRecord[K];
  } = {
    assetId: row.asset_id as V2AssetId,
    storyWorldId: row.story_world_id as V2StoryWorldId,
    sourceType: row.source_type,
    title: row.title,
    mediaRef: row.media_ref,
    contentHash: row.content_hash,
    approvedAt: row.approved_at as V2IsoDateTime,
  };
  if (row.candidate_id !== null) asset.candidateId = row.candidate_id as V2CandidateId;
  if (row.original_filename !== null) asset.originalFilename = row.original_filename;
  if (row.mime_type !== null) asset.mimeType = row.mime_type;
  if (row.byte_size !== null) asset.byteSize = row.byte_size;
  if (row.reviewer !== null) asset.reviewer = row.reviewer;
  if (row.review_reason !== null) asset.reviewReason = row.review_reason;
  return asset;
}
function mapApprovedAssetRef(row: ApprovedAssetRow): V2ApprovedAssetRef {
  return {
    assetId: row.asset_id as V2AssetId,
    storyWorldId: row.story_world_id as V2StoryWorldId,
    mediaRef: row.media_ref,
    contentHash: row.content_hash,
  };
}

function mapAssetDispatch(row: AssetDispatchRow): V2GenerationDispatchRecord {
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

function getAssetJobOrThrow(db: DatabaseSync, jobId: V2JobId): V2AssetGenerationJobRecord {
  const row = db.prepare("SELECT * FROM v2_asset_generation_jobs WHERE job_id = ?").get(jobId) as AssetJobRow | undefined;
  if (row === undefined) throw new Error(`V2 asset generation job not found: ${jobId}`);
  return mapAssetJob(row);
}

function getAssetCandidateRow(db: DatabaseSync, candidateId: V2CandidateId): AssetCandidateRow | undefined {
  return db.prepare("SELECT * FROM v2_asset_candidates WHERE candidate_id = ?").get(candidateId) as AssetCandidateRow | undefined;
}

function getReviewRow(db: DatabaseSync, candidateId: V2CandidateId, idempotencyKey: V2IdempotencyKey): AssetCandidateReviewRow | undefined {
  return db.prepare(
    "SELECT * FROM v2_asset_candidate_reviews WHERE candidate_id = ? AND idempotency_key = ?",
  ).get(candidateId, idempotencyKey) as AssetCandidateReviewRow | undefined;
}

function getApprovedAssetRowForCandidate(db: DatabaseSync, candidateId: V2CandidateId): ApprovedAssetRow | undefined {
  return db.prepare("SELECT * FROM v2_approved_assets WHERE candidate_id = ?").get(candidateId) as ApprovedAssetRow | undefined;
}

function getApprovedAssetRow(db: DatabaseSync, storyWorldId: V2StoryWorldId, assetId: V2AssetId): ApprovedAssetRow | undefined {
  return db.prepare(
    "SELECT * FROM v2_approved_assets WHERE story_world_id = ? AND asset_id = ?",
  ).get(storyWorldId, assetId) as ApprovedAssetRow | undefined;
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

function sameReview(existing: V2AssetCandidateReviewRecord, input: V2ReviewAssetCandidateInput): boolean {
  return existing.action === input.action &&
    existing.reviewedAt === input.reviewedAt &&
    existing.idempotencyKey === input.idempotencyKey &&
    (existing.reviewer ?? undefined) === input.reviewer &&
    (existing.reason ?? undefined) === input.reason;
}

function assetContentHash(candidate: V2AssetCandidateRecord): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(candidate.payload.asset)).digest("hex")}`;
}

export class V2SqliteAssetGenerationRepository implements V2AssetGenerationJobRepository, V2AssetGenerationDispatchRepository, V2AssetCandidateRepository, V2AssetReviewRepository {
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

  public async listAssetJobsByStoryWorld(storyWorldId: V2StoryWorldId, limit: number): Promise<readonly V2AssetGenerationJobRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM v2_asset_generation_jobs WHERE story_world_id = ? ORDER BY created_at DESC, job_id DESC LIMIT ?",
    ).all(storyWorldId, limit) as AssetJobRow[];
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

  public async listPendingAssetDispatches(limit: number): Promise<readonly V2GenerationDispatchRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM v2_asset_generation_dispatches WHERE status = 'pending' ORDER BY requested_at ASC LIMIT ?",
    ).all(limit) as AssetDispatchRow[];
    return rows.map(mapAssetDispatch);
  }

  public async markAssetDispatchEnqueued(input: { readonly dispatchId: string; readonly enqueuedAt: string }): Promise<V2GenerationDispatchRecord> {
    this.db.prepare(`
      UPDATE v2_asset_generation_dispatches
      SET status = 'enqueued', enqueued_at = ?, last_error = NULL
      WHERE dispatch_id = ?
    `).run(input.enqueuedAt, input.dispatchId);
    const row = this.db.prepare("SELECT * FROM v2_asset_generation_dispatches WHERE dispatch_id = ?").get(input.dispatchId) as AssetDispatchRow | undefined;
    if (row === undefined) throw new Error(`V2 asset generation dispatch not found: ${input.dispatchId}`);
    return mapAssetDispatch(row);
  }

  public async recordAssetDispatchFailure(input: { readonly dispatchId: string; readonly error: string }): Promise<V2GenerationDispatchRecord> {
    this.db.prepare(`
      UPDATE v2_asset_generation_dispatches
      SET status = 'pending', attempts = attempts + 1, last_error = ?
      WHERE dispatch_id = ?
    `).run(input.error.slice(0, 2048), input.dispatchId);
    const row = this.db.prepare("SELECT * FROM v2_asset_generation_dispatches WHERE dispatch_id = ?").get(input.dispatchId) as AssetDispatchRow | undefined;
    if (row === undefined) throw new Error(`V2 asset generation dispatch not found: ${input.dispatchId}`);
    return mapAssetDispatch(row);
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


  public async listAssetCandidates(storyWorldId: V2StoryWorldId): Promise<readonly V2AssetCandidateRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM v2_asset_candidates WHERE story_world_id = ? ORDER BY created_at DESC, candidate_id DESC",
    ).all(storyWorldId) as AssetCandidateRow[];
    return rows.map(mapAssetCandidate);
  }
  public async reviewAssetCandidate(input: V2ReviewAssetCandidateInput): Promise<V2AssetCandidateReviewResult> {
    return withV2SqliteTransaction(this.db, () => {
      const candidateRow = getAssetCandidateRow(this.db, input.candidateId);
      if (candidateRow === undefined) throw new Error(`V2 asset candidate not found: ${input.candidateId}`);
      const existingReviewRow = getReviewRow(this.db, input.candidateId, input.idempotencyKey);
      if (existingReviewRow !== undefined) {
        const review = mapReview(existingReviewRow);
        if (!sameReview(review, input)) throw new Error("V2 asset candidate review idempotency key conflict");
        const candidate = mapAssetCandidate(candidateRow);
        const approvedRow = review.resultingStatus === "approved"
          ? getApprovedAssetRowForCandidate(this.db, input.candidateId)
          : undefined;
        return {
          candidate,
          review,
          inserted: false,
          ...(approvedRow === undefined ? {} : { approvedAsset: mapApprovedAsset(approvedRow) }),
        };
      }

      const nextStatus = assertV2ReviewTransition(
        candidateRow.status as V2ReviewStatus,
        input.action as V2ReviewAction,
      ) as V2AssetCandidateStatus;
      const reviewId = `asset-review:${input.candidateId}:${input.idempotencyKey}`;
      this.db.prepare(`
        UPDATE v2_asset_candidates
        SET status = ?, reviewed_at = ?, reviewer = ?, review_reason = ?
        WHERE candidate_id = ?
      `).run(nextStatus, input.reviewedAt, input.reviewer ?? null, input.reason ?? null, input.candidateId);
      this.db.prepare(`
        INSERT INTO v2_asset_candidate_reviews (
          review_id, candidate_id, action, resulting_status, reviewed_at,
          idempotency_key, reviewer, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reviewId,
        input.candidateId,
        input.action,
        nextStatus,
        input.reviewedAt,
        input.idempotencyKey,
        input.reviewer ?? null,
        input.reason ?? null,
      );

      const updatedRow = getAssetCandidateRow(this.db, input.candidateId);
      if (updatedRow === undefined) throw new Error(`V2 asset candidate not found after review: ${input.candidateId}`);
      const candidate = mapAssetCandidate(updatedRow);
      let approvedAsset: V2ApprovedAssetRecord | undefined;
      if (nextStatus === "approved") {
        const asset = candidate.payload.asset;
        const existingAsset = getApprovedAssetRow(this.db, candidate.storyWorldId, asset.assetId);
        if (existingAsset !== undefined && existingAsset.candidate_id !== candidate.candidateId) {
          throw new Error("V2 approved asset already exists for a different candidate");
        }
        this.db.prepare(`
          INSERT INTO v2_approved_assets (
            asset_id, story_world_id, source_type, candidate_id, title, media_ref, content_hash,
            approved_at, reviewer, review_reason, release_id
          ) VALUES (?, ?, 'candidate', ?, ?, ?, ?, ?, ?, ?, NULL)
        `).run(
          asset.assetId,
          candidate.storyWorldId,
          candidate.candidateId,
          asset.assetId,
          asset.mediaRef,
          assetContentHash(candidate),
          input.reviewedAt,
          input.reviewer ?? null,
          input.reason ?? null,
        );
        const approvedRow = getApprovedAssetRowForCandidate(this.db, candidate.candidateId);
        if (approvedRow === undefined) throw new Error(`V2 approved asset not found after review: ${candidate.candidateId}`);
        approvedAsset = mapApprovedAsset(approvedRow);
      }
      const reviewRow = getReviewRow(this.db, input.candidateId, input.idempotencyKey);
      if (reviewRow === undefined) throw new Error(`V2 asset candidate review not found after insert: ${reviewId}`);
      return {
        candidate,
        review: mapReview(reviewRow),
        inserted: true,
        ...(approvedAsset === undefined ? {} : { approvedAsset }),
      };
    });
  }

  public async createManualAsset(input: V2CreateManualAssetInput): Promise<V2ApprovedAssetRecord> {
    this.db.prepare(`
      INSERT INTO v2_approved_assets (
        asset_id, story_world_id, source_type, candidate_id, title, media_ref,
        content_hash, original_filename, mime_type, byte_size, approved_at,
        reviewer, review_reason, release_id
      ) VALUES (?, ?, 'manual', NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
      ON CONFLICT(asset_id) DO UPDATE SET
        title = excluded.title,
        media_ref = excluded.media_ref,
        content_hash = excluded.content_hash,
        original_filename = excluded.original_filename,
        mime_type = excluded.mime_type,
        byte_size = excluded.byte_size
      WHERE v2_approved_assets.story_world_id = excluded.story_world_id
        AND v2_approved_assets.source_type = 'manual'
    `).run(
      input.assetId,
      input.storyWorldId,
      input.title,
      input.mediaRef,
      input.contentHash,
      input.originalFilename,
      input.mimeType,
      input.byteSize,
      input.createdAt,
    );
    const row = getApprovedAssetRow(this.db, input.storyWorldId, input.assetId);
    if (row === undefined) throw new Error(`V2 manual asset not found after insert: ${input.assetId}`);
    return mapApprovedAsset(row);
  }
  public async getApprovedAsset(input: { readonly storyWorldId: V2StoryWorldId; readonly assetId: V2AssetId }): Promise<V2ApprovedAssetRef | undefined> {
    const row = getApprovedAssetRow(this.db, input.storyWorldId, input.assetId);
    return row === undefined ? undefined : mapApprovedAssetRef(row);
  }


  public async listApprovedAssets(storyWorldId: V2StoryWorldId): Promise<readonly V2ApprovedAssetRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM v2_approved_assets WHERE story_world_id = ? ORDER BY approved_at DESC, asset_id DESC",
    ).all(storyWorldId) as ApprovedAssetRow[];
    return rows.map(mapApprovedAsset);
  }
  public async listReleaseAssets(input: { readonly storyWorldId: V2StoryWorldId; readonly releaseId: V2ReleaseId }): Promise<readonly V2ApprovedAssetRef[]> {
    const rows = this.db.prepare(`
      SELECT * FROM v2_approved_assets
      WHERE story_world_id = ? AND release_id = ?
      ORDER BY asset_id ASC
    `).all(input.storyWorldId, input.releaseId) as ApprovedAssetRow[];
    return rows.map(mapApprovedAssetRef);
  }
}
