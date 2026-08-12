import assert from "node:assert/strict";
import test from "node:test";

import type {
  V2AssetId,
  V2CandidateId,
  V2CreateAssetGenerationJobInput,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2StoryWorldId,
} from "@living-network/contracts";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  revertV2Migrations,
} from "../platform/index.ts";
import { v2GenerationJobMigrations } from "./migrations.ts";
import { V2SqliteAssetGenerationRepository } from "./asset-repository.ts";

const now = "2026-08-12T02:00:00.000Z" as V2IsoDateTime;

function assetInput(overrides: Partial<V2CreateAssetGenerationJobInput> = {}): V2CreateAssetGenerationJobInput {
  return {
    jobId: (overrides.jobId ?? "job_asset_bridge") as V2JobId,
    storyWorldId: (overrides.storyWorldId ?? "world_generation") as V2StoryWorldId,
    idempotencyKey: (overrides.idempotencyKey ?? "idem-asset-bridge") as V2IdempotencyKey,
    prompt: overrides.prompt ?? "Generate bridge key art.",
    workflowVersion: overrides.workflowVersion ?? "workflow-v1",
    workflow: overrides.workflow ?? { "1": { class_type: "KSampler", inputs: { seed: 42 } } },
    createdAt: overrides.createdAt ?? now,
    negativePrompt: overrides.negativePrompt ?? "low quality",
    seed: overrides.seed ?? 42,
    ...(overrides.maxAttempts === undefined ? { maxAttempts: 2 } : { maxAttempts: overrides.maxAttempts }),
  };
}

test("V2 asset generation migration creates and drops asset tables", () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    assert.notEqual(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_asset_generation_jobs'").get(), undefined);
    assert.notEqual(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_asset_generation_dispatches'").get(), undefined);
    assert.notEqual(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_asset_candidates'").get(), undefined);
    revertV2Migrations(db, v2GenerationJobMigrations);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_asset_generation_jobs'").get(), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("creates V2 asset job and dispatch facts atomically", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    const result = await repository.createAssetJob(assetInput());
    assert.equal(result.inserted, true);
    assert.equal(result.job.status, "queued");
    assert.equal(result.job.workflowVersion, "workflow-v1");
    const dispatch = db.prepare("SELECT * FROM v2_asset_generation_dispatches WHERE job_id = ?").get(result.job.jobId) as { status: string } | undefined;
    assert.equal(dispatch?.status, "pending");
  } finally {
    db.close();
    cleanup();
  }
});

test("replays identical asset idempotency keys and rejects conflicting payloads", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    const first = await repository.createAssetJob(assetInput());
    const replay = await repository.createAssetJob(assetInput({ jobId: "job_asset_replay" as V2JobId }));
    assert.equal(replay.inserted, false);
    assert.equal(replay.job.jobId, first.job.jobId);
    await assert.rejects(repository.createAssetJob(assetInput({ prompt: "Different art." })), /idempotency key conflict/);
  } finally {
    db.close();
    cleanup();
  }
});

test("tracks asset job claim, submit, success, candidate persistence, and cancel", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    await repository.createAssetJob(assetInput());
    const claimed = await repository.markAssetJobClaimed({
      jobId: "job_asset_bridge" as V2JobId,
      claimedAt: "2026-08-12T02:01:00.000Z",
      leaseExpiresAt: "2026-08-12T02:06:00.000Z",
    });
    assert.equal(claimed.status, "claimed");
    const running = await repository.markAssetJobRunning({
      jobId: claimed.jobId,
      updatedAt: "2026-08-12T02:02:00.000Z",
    });
    assert.equal(running.status, "running");
    const submitted = await repository.markAssetJobSubmitted({
      jobId: running.jobId,
      submittedAt: "2026-08-12T02:03:00.000Z",
      externalJobId: "fake-comfy:job_asset_bridge",
    });
    assert.equal(submitted.externalJobId, "fake-comfy:job_asset_bridge");
    const candidateId = "candidate_asset_bridge" as V2CandidateId;
    const candidate = await repository.createAssetCandidate({
      candidateId,
      jobId: running.jobId,
      storyWorldId: running.storyWorldId,
      status: "pending",
      payload: {
        asset: {
          assetId: "asset_bridge" as V2AssetId,
          mediaKind: "image",
          mediaRef: "media://fake-comfy/job_asset_bridge.png",
          prompt: running.prompt,
          workflowVersion: running.workflowVersion,
          sourceJobId: running.jobId,
          ...(running.seed === undefined ? {} : { seed: running.seed }),
        },
        validationNotes: ["Fake ComfyUI output for review."],
      },
      createdAt: "2026-08-12T02:04:00.000Z" as V2IsoDateTime,
    });
    assert.equal(candidate.inserted, true);
    assert.equal(candidate.candidate.status, "pending");
    const succeeded = await repository.markAssetJobSucceeded({
      jobId: running.jobId,
      completedAt: "2026-08-12T02:05:00.000Z",
      mediaRef: "media://fake-comfy/job_asset_bridge.png",
      candidateId,
    });
    assert.equal(succeeded.status, "succeeded");
    assert.equal(succeeded.candidateId, candidateId);

    await repository.createAssetJob(assetInput({
      jobId: "job_asset_cancel" as V2JobId,
      idempotencyKey: "idem-asset-cancel" as V2IdempotencyKey,
    }));
    const cancelled = await repository.cancelAssetJob({
      jobId: "job_asset_cancel" as V2JobId,
      cancelledAt: "2026-08-12T02:06:00.000Z",
      reason: "creator cancelled",
    });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.failureReason, "creator cancelled");
  } finally {
    db.close();
    cleanup();
  }
});

test("recovers expired asset leases and honors retry limits", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    await repository.createAssetJob(assetInput({ maxAttempts: 2 }));
    await repository.markAssetJobClaimed({
      jobId: "job_asset_bridge" as V2JobId,
      claimedAt: "2026-08-12T02:01:00.000Z",
      leaseExpiresAt: "2026-08-12T02:02:00.000Z",
    });
    await repository.markAssetJobRunning({
      jobId: "job_asset_bridge" as V2JobId,
      updatedAt: "2026-08-12T02:01:30.000Z",
    });
    const recovered = await repository.recoverExpiredAssetJobLease({
      jobId: "job_asset_bridge" as V2JobId,
      recoveredAt: "2026-08-12T02:03:00.000Z",
    });
    assert.equal(recovered.status, "queued");
    const retry = await repository.markAssetJobFailed({
      jobId: recovered.jobId,
      failedAt: "2026-08-12T02:04:00.000Z",
      reason: "ComfyUI not ready",
      retryable: true,
    });
    assert.equal(retry.status, "queued");
    assert.equal(retry.attempts, 1);
    const failed = await repository.markAssetJobFailed({
      jobId: recovered.jobId,
      failedAt: "2026-08-12T02:05:00.000Z",
      reason: "ComfyUI not ready again",
      retryable: true,
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 2);
  } finally {
    db.close();
    cleanup();
  }
});
