import assert from "node:assert/strict";
import test from "node:test";

import type {
  V2AssetId,
  V2CandidateId,
  V2CreateAssetGenerationJobInput,
  V2CreateManualAssetInput,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2ReleaseId,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
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

async function createPendingAssetCandidate(repository: V2SqliteAssetGenerationRepository, overrides: {
  readonly candidateId?: V2CandidateId;
  readonly jobId?: V2JobId;
  readonly assetId?: V2AssetId;
  readonly storyWorldId?: V2StoryWorldId;
  readonly idempotencyKey?: V2IdempotencyKey;
} = {}) {
  const jobOverrides: Partial<V2CreateAssetGenerationJobInput> = {
    jobId: overrides.jobId ?? ("job_asset_review" as V2JobId),
    idempotencyKey: overrides.idempotencyKey ?? ("idem-asset-review" as V2IdempotencyKey),
    ...(overrides.storyWorldId === undefined ? {} : { storyWorldId: overrides.storyWorldId }),
  };
  const jobResult = await repository.createAssetJob(assetInput(jobOverrides));
  return repository.createAssetCandidate({
    candidateId: overrides.candidateId ?? ("candidate_asset_review" as V2CandidateId),
    jobId: jobResult.job.jobId,
    storyWorldId: jobResult.job.storyWorldId,
    status: "pending",
    payload: {
      asset: {
        assetId: overrides.assetId ?? ("asset_review" as V2AssetId),
        mediaKind: "image",
        mediaRef: `media://fake-comfy/${jobResult.job.jobId}.png`,
        prompt: jobResult.job.prompt,
        workflowVersion: jobResult.job.workflowVersion,
        sourceJobId: jobResult.job.jobId,
        ...(jobResult.job.seed === undefined ? {} : { seed: jobResult.job.seed }),
      },
      validationNotes: ["Fake ComfyUI output for review."],
    },
    createdAt: "2026-08-12T02:04:00.000Z" as V2IsoDateTime,
  });
}

test("V2 asset generation migration creates and drops asset tables", () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    assert.notEqual(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_asset_generation_jobs'").get(), undefined);
    assert.notEqual(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_asset_generation_dispatches'").get(), undefined);
    assert.notEqual(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_asset_candidates'").get(), undefined);
    assert.notEqual(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_asset_candidate_reviews'").get(), undefined);
    assert.notEqual(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_approved_assets'").get(), undefined);
    revertV2Migrations(db, v2GenerationJobMigrations);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_asset_generation_jobs'").get(), undefined);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_asset_candidate_reviews'").get(), undefined);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_approved_assets'").get(), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("approves V2 asset candidates with review audit and approved asset facts", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    const seeded = await createPendingAssetCandidate(repository);
    const reviewInput = {
      candidateId: seeded.candidate.candidateId,
      action: "approve" as const,
      reviewedAt: "2026-08-12T02:10:00.000Z" as V2IsoDateTime,
      idempotencyKey: "idem-review-approve" as V2IdempotencyKey,
      reviewer: "creator:ai2",
      reason: "Asset matches the scene brief.",
    };

    const approved = await repository.reviewAssetCandidate(reviewInput);
    assert.equal(approved.inserted, true);
    assert.equal(approved.candidate.status, "approved");
    assert.equal(approved.review.resultingStatus, "approved");
    assert.equal(approved.approvedAsset?.assetId, "asset_review");
    assert.equal(approved.approvedAsset?.mediaRef, "media://fake-comfy/job_asset_review.png");
    assert.match(approved.approvedAsset?.contentHash ?? "", /^sha256:[a-f0-9]{64}$/);

    const approvedRef = await repository.getApprovedAsset({
      storyWorldId: seeded.candidate.storyWorldId,
      assetId: "asset_review" as V2AssetId,
    });
    assert.equal(approvedRef?.mediaRef, "media://fake-comfy/job_asset_review.png");
    assert.equal(approvedRef?.contentHash, approved.approvedAsset?.contentHash);

    db.prepare("UPDATE v2_approved_assets SET release_id = ? WHERE asset_id = ?")
      .run("release_review" as V2ReleaseId, "asset_review");
    const releaseAssets = await repository.listReleaseAssets({
      storyWorldId: seeded.candidate.storyWorldId,
      releaseId: "release_review" as V2ReleaseId,
    });
    assert.equal(releaseAssets.length, 1);
    assert.equal(releaseAssets[0]?.assetId, "asset_review");

    const candidates = await repository.listAssetCandidates(seeded.candidate.storyWorldId);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.candidateId, seeded.candidate.candidateId);
    const approvedAssets = await repository.listApprovedAssets(seeded.candidate.storyWorldId);
    assert.equal(approvedAssets.length, 1);
    assert.equal(approvedAssets[0]?.assetId, "asset_review");
  } finally {
    db.close();
    cleanup();
  }
});

test("creates manual formal assets without asset candidates", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    const input: V2CreateManualAssetInput = {
      assetId: "asset:manual:station" as V2AssetId,
      storyWorldId: "world_manual_assets" as V2StoryWorldId,
      title: "Station Background",
      mediaRef: "media://local/v2/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
      contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      originalFilename: "station.png",
      mimeType: "image/png",
      byteSize: 1024,
      createdAt: "2026-08-12T02:15:00.000Z" as V2IsoDateTime,
    };

    const created = await repository.createManualAsset(input);
    assert.equal(created.sourceType, "manual");
    assert.equal(created.candidateId, undefined);
    assert.equal(created.title, "Station Background");
    assert.equal(created.originalFilename, "station.png");

    const updated = await repository.createManualAsset({ ...input, title: "Station Background Updated", byteSize: 2048 });
    assert.equal(updated.title, "Station Background Updated");
    assert.equal(updated.byteSize, 2048);

    const assets = await repository.listApprovedAssets(input.storyWorldId);
    assert.equal(assets.length, 1);
    assert.equal(assets[0]?.sourceType, "manual");
  } finally {
    db.close();
    cleanup();
  }
});

test("replays identical V2 asset candidate reviews and rejects conflicts", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    const seeded = await createPendingAssetCandidate(repository);
    const reviewInput = {
      candidateId: seeded.candidate.candidateId,
      action: "approve" as const,
      reviewedAt: "2026-08-12T02:10:00.000Z" as V2IsoDateTime,
      idempotencyKey: "idem-review-replay" as V2IdempotencyKey,
      reviewer: "creator:ai2",
      reason: "Approved once.",
    };

    const first = await repository.reviewAssetCandidate(reviewInput);
    const replay = await repository.reviewAssetCandidate(reviewInput);
    assert.equal(first.inserted, true);
    assert.equal(replay.inserted, false);
    assert.equal(replay.candidate.status, "approved");
    assert.equal(replay.approvedAsset?.contentHash, first.approvedAsset?.contentHash);

    await assert.rejects(
      repository.reviewAssetCandidate({ ...reviewInput, reason: "Different payload." }),
      /idempotency key conflict/,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("rejects or requests changes without creating approved asset facts", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    const changesSeed = await createPendingAssetCandidate(repository, {
      candidateId: "candidate_asset_changes" as V2CandidateId,
      jobId: "job_asset_changes" as V2JobId,
      assetId: "asset_changes" as V2AssetId,
      idempotencyKey: "idem-asset-changes" as V2IdempotencyKey,
    });
    const changes = await repository.reviewAssetCandidate({
      candidateId: changesSeed.candidate.candidateId,
      action: "request_changes",
      reviewedAt: "2026-08-12T02:11:00.000Z" as V2IsoDateTime,
      idempotencyKey: "idem-review-changes" as V2IdempotencyKey,
      reason: "Need a brighter palette.",
    });
    assert.equal(changes.candidate.status, "changes_requested");
    assert.equal(changes.approvedAsset, undefined);
    assert.equal(await repository.getApprovedAsset({
      storyWorldId: changesSeed.candidate.storyWorldId,
      assetId: "asset_changes" as V2AssetId,
    }), undefined);

    const rejectedSeed = await createPendingAssetCandidate(repository, {
      candidateId: "candidate_asset_reject" as V2CandidateId,
      jobId: "job_asset_reject" as V2JobId,
      assetId: "asset_reject" as V2AssetId,
      idempotencyKey: "idem-asset-reject" as V2IdempotencyKey,
    });
    const rejected = await repository.reviewAssetCandidate({
      candidateId: rejectedSeed.candidate.candidateId,
      action: "reject",
      reviewedAt: "2026-08-12T02:12:00.000Z" as V2IsoDateTime,
      idempotencyKey: "idem-review-reject" as V2IdempotencyKey,
      reason: "Not usable.",
    });
    assert.equal(rejected.candidate.status, "rejected");
    assert.equal(rejected.approvedAsset, undefined);
    await assert.rejects(
      repository.reviewAssetCandidate({
        candidateId: rejectedSeed.candidate.candidateId,
        action: "approve",
        reviewedAt: "2026-08-12T02:13:00.000Z" as V2IsoDateTime,
        idempotencyKey: "idem-review-after-reject" as V2IdempotencyKey,
      }),
      /Cannot approve a rejected candidate/,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("rejects approved asset identity collisions across candidates", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    const first = await createPendingAssetCandidate(repository, { candidateId: "candidate_collision_a" as V2CandidateId, jobId: "job_collision_a" as V2JobId, assetId: "asset_collision" as V2AssetId, idempotencyKey: "idem_collision_a" as V2IdempotencyKey });
    await repository.reviewAssetCandidate({ candidateId: first.candidate.candidateId, action: "approve", reviewedAt: now, idempotencyKey: "review_collision_a" as V2IdempotencyKey });
    const second = await createPendingAssetCandidate(repository, { candidateId: "candidate_collision_b" as V2CandidateId, jobId: "job_collision_b" as V2JobId, assetId: "asset_collision" as V2AssetId, idempotencyKey: "idem_collision_b" as V2IdempotencyKey });
    await assert.rejects(() => repository.reviewAssetCandidate({ candidateId: second.candidate.candidateId, action: "approve", reviewedAt: now, idempotencyKey: "review_collision_b" as V2IdempotencyKey }), /different candidate/);
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
    assert.equal(await repository.getAssetJob("missing" as V2JobId), undefined);
    assert.deepEqual(await repository.listAssetJobsByStatus("queued", 10), [result.job]);
    assert.deepEqual(await repository.listAssetJobsByStoryWorld(result.job.storyWorldId, 10), [result.job]);
    assert.deepEqual(await repository.listAssetJobsByStoryWorld("world_other" as V2StoryWorldId, 10), []);
    const dispatch = db.prepare("SELECT * FROM v2_asset_generation_dispatches WHERE job_id = ?").get(result.job.jobId) as { status: string } | undefined;
    assert.equal(dispatch?.status, "pending");
  } finally {
    db.close();
    cleanup();
  }
});

test("asset dispatch failure remains pending and records retry details", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    await repository.createAssetJob(assetInput());
    const dispatch = (await repository.listPendingAssetDispatches(10))[0];
    assert.ok(dispatch);
    const failed = await repository.recordAssetDispatchFailure({
      dispatchId: dispatch.dispatchId,
      error: "redis down",
    });
    assert.equal(failed.status, "pending");
    assert.equal(failed.attempts, 1);
    assert.equal(failed.lastError, "redis down");
    const enqueued = await repository.markAssetDispatchEnqueued({
      dispatchId: dispatch.dispatchId,
      enqueuedAt: "2026-08-12T02:02:00.000Z",
    });
    assert.equal(enqueued.status, "enqueued");
    assert.equal(enqueued.lastError, undefined);
    await assert.rejects(() => repository.markAssetDispatchEnqueued({ dispatchId: "missing", enqueuedAt: now }), /dispatch not found/);
    await assert.rejects(() => repository.recordAssetDispatchFailure({ dispatchId: "missing", error: "missing" }), /dispatch not found/);
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
    const candidateReplay = await repository.createAssetCandidate(candidate.candidate);
    assert.equal(candidateReplay.inserted, false);
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
