import assert from "node:assert/strict";
import test from "node:test";

import type {
  V2CharacterId,
  V2CreateSceneGenerationJobInput,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2Revision,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  revertV2Migrations,
} from "../platform/index.ts";
import { v2GenerationJobMigrations } from "./migrations.ts";
import { V2SqliteGenerationJobRepository } from "./repository.ts";

const now = "2026-08-12T00:00:00.000Z" as V2IsoDateTime;

function input(overrides: Partial<V2CreateSceneGenerationJobInput> = {}): V2CreateSceneGenerationJobInput {
  const storyWorldId = (overrides.storyWorldId ?? "world_generation") as V2StoryWorldId;
  const context = overrides.context ?? {
    storyWorldId,
    baseCanonRevision: 1 as V2Revision,
    requestedAt: now,
    prompt: "Write the bridge scene.",
    promptPreview: "Write the bridge scene.",
    tokenBudget: 512,
    contextHash: "sha256:generation-context",
    sourceFactIds: ["fact-bridge"],
    sourceCharacterIds: ["char_mira" as V2CharacterId],
    sourceSceneIds: ["scene_intro"],
    facts: [{ id: "fact-bridge", text: "The bridge is sealed.", visibility: "player_visible" as const }],
    characters: [{ characterId: "char_mira" as V2CharacterId, name: "Mira" }],
    scenes: [{ sceneId: "scene_intro", title: "Intro" }],
  };
  return {
    jobId: (overrides.jobId ?? "job_scene_bridge") as V2JobId,
    storyWorldId,
    baseCanonRevision: (overrides.baseCanonRevision ?? 1) as V2Revision,
    idempotencyKey: (overrides.idempotencyKey ?? "idem-scene-bridge") as V2IdempotencyKey,
    prompt: overrides.prompt ?? "Write the bridge scene.",
    context,
    createdAt: overrides.createdAt ?? now,
    ...(overrides.maxAttempts === undefined ? {} : { maxAttempts: overrides.maxAttempts }),
  };
}

test("V2 generation migration creates and drops job tables", () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    assert.notEqual(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_generation_jobs'").get(), undefined);
    assert.notEqual(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_generation_dispatches'").get(), undefined);
    revertV2Migrations(db, v2GenerationJobMigrations);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_generation_jobs'").get(), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("creates V2 scene job and dispatch facts atomically", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteGenerationJobRepository(db);
    const result = await repository.createSceneJob(input());
    assert.equal(result.inserted, true);
    assert.equal(result.job.status, "queued");
    assert.equal(result.job.context.contextHash, "sha256:generation-context");
    const dispatches = await repository.listPendingDispatches(10);
    assert.equal(dispatches.length, 1);
    assert.equal(dispatches[0]?.jobId, result.job.jobId);
    assert.equal((await repository.getJob("missing" as V2JobId)), undefined);
    assert.deepEqual(await repository.listJobsByStatus("queued", 10), [result.job]);
    assert.deepEqual(await repository.listJobsByStoryWorld(result.job.storyWorldId, 10), [result.job]);
    assert.deepEqual(await repository.listJobsByStoryWorld("world_other" as V2StoryWorldId, 10), []);
  } finally {
    db.close();
    cleanup();
  }
});

test("replays identical idempotency keys and rejects conflicting payloads", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteGenerationJobRepository(db);
    const first = await repository.createSceneJob(input());
    const replay = await repository.createSceneJob(input({ jobId: "job_scene_bridge_replay" as V2JobId }));
    assert.equal(replay.inserted, false);
    assert.equal(replay.job.jobId, first.job.jobId);
    await assert.rejects(repository.createSceneJob(input({ prompt: "Different prompt" })), /idempotency key conflict/);
  } finally {
    db.close();
    cleanup();
  }
});

test("dispatch failure remains pending and records retry details", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteGenerationJobRepository(db);
    await repository.createSceneJob(input());
    const dispatch = (await repository.listPendingDispatches(10))[0];
    assert.ok(dispatch);
    const failed = await repository.recordDispatchFailure({
      dispatchId: dispatch.dispatchId,
      error: "redis down",
    });
    assert.equal(failed.status, "pending");
    assert.equal(failed.attempts, 1);
    assert.equal(failed.lastError, "redis down");
    const enqueued = await repository.markDispatchEnqueued({
      dispatchId: dispatch.dispatchId,
      enqueuedAt: "2026-08-12T00:02:00.000Z",
    });
    assert.equal(enqueued.status, "enqueued");
    assert.equal(enqueued.lastError, undefined);
    await assert.rejects(() => repository.markDispatchEnqueued({ dispatchId: "missing", enqueuedAt: now }), /dispatch not found/);
    await assert.rejects(() => repository.recordDispatchFailure({ dispatchId: "missing", error: "missing" }), /dispatch not found/);
  } finally {
    db.close();
    cleanup();
  }
});

test("tracks claim, running, success, retry, and cancel states", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteGenerationJobRepository(db);
    await repository.createSceneJob(input({ maxAttempts: 2 }));
    const claimed = await repository.markJobClaimed({
      jobId: "job_scene_bridge" as V2JobId,
      claimedAt: "2026-08-12T00:03:00.000Z",
      leaseExpiresAt: "2026-08-12T00:08:00.000Z",
    });
    assert.equal(claimed.status, "claimed");
    const running = await repository.markJobRunning({ jobId: claimed.jobId, updatedAt: "2026-08-12T00:04:00.000Z" });
    assert.equal(running.status, "running");
    const retry = await repository.markJobFailed({
      jobId: running.jobId,
      failedAt: "2026-08-12T00:05:00.000Z",
      reason: "temporary provider failure",
      retryable: true,
    });
    assert.equal(retry.status, "queued");
    assert.equal(retry.attempts, 1);
    await repository.markJobClaimed({
      jobId: retry.jobId,
      claimedAt: "2026-08-12T00:06:00.000Z",
      leaseExpiresAt: "2026-08-12T00:11:00.000Z",
    });
    await repository.markJobRunning({ jobId: retry.jobId, updatedAt: "2026-08-12T00:07:00.000Z" });
    const succeeded = await repository.markJobSucceeded({
      jobId: retry.jobId,
      completedAt: "2026-08-12T00:08:00.000Z",
      candidateId: "candidate_bridge",
      providerResponseId: "response-1",
      rawOutputPreview: "{\"scene\":true}",
    });
    assert.equal(succeeded.status, "succeeded");
    assert.equal(succeeded.candidateId, "candidate_bridge");

    await repository.createSceneJob(input({
      jobId: "job_cancel" as V2JobId,
      idempotencyKey: "idem-cancel" as V2IdempotencyKey,
    }));
    const cancelled = await repository.cancelJob({
      jobId: "job_cancel" as V2JobId,
      cancelledAt: "2026-08-12T00:09:00.000Z",
      reason: "creator cancelled",
    });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.failureReason, "creator cancelled");
  } finally {
    db.close();
    cleanup();
  }
});

test("recovers expired leases without reopening terminal failed jobs", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteGenerationJobRepository(db);
    await repository.createSceneJob(input({ maxAttempts: 1 }));
    await repository.markJobClaimed({
      jobId: "job_scene_bridge" as V2JobId,
      claimedAt: "2026-08-12T00:03:00.000Z",
      leaseExpiresAt: "2026-08-12T00:04:00.000Z",
    });
    await repository.markJobRunning({
      jobId: "job_scene_bridge" as V2JobId,
      updatedAt: "2026-08-12T00:03:30.000Z",
    });
    const recovered = await repository.recoverExpiredJobLease({
      jobId: "job_scene_bridge" as V2JobId,
      recoveredAt: "2026-08-12T00:05:00.000Z",
    });
    assert.equal(recovered.status, "queued");
    assert.equal(recovered.claimedAt, undefined);

    await repository.markJobClaimed({
      jobId: recovered.jobId,
      claimedAt: "2026-08-12T00:06:00.000Z",
      leaseExpiresAt: "2026-08-12T00:07:00.000Z",
    });
    await repository.markJobRunning({
      jobId: recovered.jobId,
      updatedAt: "2026-08-12T00:06:30.000Z",
    });
    const failed = await repository.markJobFailed({
      jobId: recovered.jobId,
      failedAt: "2026-08-12T00:07:00.000Z",
      reason: "terminal provider failure",
      retryable: true,
    });
    assert.equal(failed.status, "failed");
    const claimAfterTerminalFailure = await repository.markJobClaimed({
      jobId: recovered.jobId,
      claimedAt: "2026-08-12T00:08:00.000Z",
      leaseExpiresAt: "2026-08-12T00:09:00.000Z",
    });
    assert.equal(claimAfterTerminalFailure.status, "failed");
  } finally {
    db.close();
    cleanup();
  }
});
