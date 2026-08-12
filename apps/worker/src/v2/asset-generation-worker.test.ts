import assert from "node:assert/strict";
import test from "node:test";

import type {
  V2CreateAssetGenerationJobInput,
  V2CandidateId,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2StoryWorldId,
} from "@living-network/contracts";
import type {
  V2AssetMediaStorePort,
  V2StoreGeneratedAssetMediaInput,
  V2StoredAssetMediaResult,
} from "@living-network/ports";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  V2SqliteAssetGenerationRepository,
  v2GenerationJobMigrations,
} from "@living-network/database";
import { ComfyUiError, FakeComfyUiClient } from "../comfyui-client.ts";
import type { ComfyUiClient, ComfyUiResult, ComfyUiSubmitRequest, ComfyUiSubmitResult } from "../comfyui-types.ts";
import { processV2AssetGenerationJob } from "./asset-generation-worker.ts";

const now = "2026-08-12T03:00:00.000Z" as V2IsoDateTime;

function input(overrides: Partial<V2CreateAssetGenerationJobInput> = {}): V2CreateAssetGenerationJobInput {
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
    maxAttempts: overrides.maxAttempts ?? 2,
  };
}

function queuePayload(job = input()) {
  return {
    jobId: job.jobId,
    kind: "asset" as const,
    workflowVersion: job.workflowVersion,
    correlationId: "corr-asset-worker-test",
  };
}

class FailingComfyUiClient implements ComfyUiClient {
  public async submit(): Promise<ComfyUiSubmitResult> {
    throw new ComfyUiError("TIMEOUT", "ComfyUI request timed out", { retryable: true });
  }

  public async getResult(): Promise<ComfyUiResult> {
    throw new Error("submit should fail first");
  }
}

class InvalidMediaComfyUiClient implements ComfyUiClient {
  public async submit(request: ComfyUiSubmitRequest): Promise<ComfyUiSubmitResult> {
    return { externalJobId: `bad:${request.jobId}` };
  }

  public async getResult(externalJobId: string): Promise<ComfyUiResult> {
    return { externalJobId, mediaRef: "https://example.com/generated.png" };
  }
}

class HttpMediaComfyUiClient implements ComfyUiClient {
  public async submit(request: ComfyUiSubmitRequest): Promise<ComfyUiSubmitResult> {
    return { externalJobId: `http-comfy:${request.jobId}` };
  }

  public async getResult(externalJobId: string): Promise<ComfyUiResult> {
    return {
      externalJobId,
      mediaRef: "https://comfy.local/view?filename=generated.png&type=output",
    };
  }
}

class CapturingMediaStore implements V2AssetMediaStorePort {
  public readonly stored: V2StoreGeneratedAssetMediaInput[] = [];

  public async storeGeneratedAsset(input: V2StoreGeneratedAssetMediaInput): Promise<V2StoredAssetMediaResult> {
    this.stored.push(input);
    return {
      mediaRef: `media://local/v2/assets/${input.jobId}.png`,
      contentHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      byteLength: 8,
      contentType: "image/png",
    };
  }
}

class RetryableMediaStoreError extends Error {
  public readonly retryable = true;
}

class FailingMediaStore implements V2AssetMediaStorePort {
  public async storeGeneratedAsset(): Promise<V2StoredAssetMediaResult> {
    throw new RetryableMediaStoreError("media write failed");
  }
}

class ExistingExternalComfyUiClient implements ComfyUiClient {
  public submitCount = 0;

  public async submit(request: ComfyUiSubmitRequest): Promise<ComfyUiSubmitResult> {
    this.submitCount += 1;
    return { externalJobId: `fake-comfy:${request.jobId}` };
  }

  public async getResult(externalJobId: string): Promise<ComfyUiResult> {
    return {
      externalJobId,
      mediaRef: "media://fake-comfy/recovered-asset.png",
    };
  }
}

test("V2 asset worker submits ComfyUI output as a pending asset candidate", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    const created = await repository.createAssetJob(input());
    const result = await processV2AssetGenerationJob(queuePayload(), {
      jobs: repository,
      candidates: repository,
      comfyUi: new FakeComfyUiClient(),
    }, {
      now: () => new Date("2026-08-12T03:01:00.000Z"),
    });
    assert.equal(result.kind, "succeeded");
    assert.equal(result.job.status, "succeeded");
    assert.equal(result.job.mediaRef, "media://fake-comfy/job_asset_bridge.png");
    assert.equal(result.candidateId, "candidate:asset:job_asset_bridge");
    const candidate = await repository.getAssetCandidate(result.candidateId!);
    assert.equal(candidate?.status, "pending");
    assert.equal(candidate?.jobId, created.job.jobId);
    assert.equal(candidate?.payload.asset.sourceJobId, created.job.jobId);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 asset worker stores external ComfyUI media as a controlled local media ref", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    await repository.createAssetJob(input());
    const mediaStore = new CapturingMediaStore();
    const result = await processV2AssetGenerationJob(queuePayload(), {
      jobs: repository,
      candidates: repository,
      comfyUi: new HttpMediaComfyUiClient(),
      mediaStore,
    }, { now: () => new Date("2026-08-12T03:02:00.000Z") });
    assert.equal(result.kind, "succeeded");
    assert.equal(result.job.mediaRef, "media://local/v2/assets/job_asset_bridge.png");
    assert.equal(mediaStore.stored.length, 1);
    assert.equal(mediaStore.stored[0]?.sourceMediaRef, "https://comfy.local/view?filename=generated.png&type=output");
    const candidate = await repository.getAssetCandidate(result.candidateId!);
    assert.equal(candidate?.payload.asset.mediaRef, "media://local/v2/assets/job_asset_bridge.png");
    assert.deepEqual(candidate?.payload.validationNotes, [
      "Generated by V2 asset worker; pending creator review.",
      "External ComfyUI media stored as sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.",
    ]);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 asset worker skips terminal duplicate consumption without duplicating candidates", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    await repository.createAssetJob(input());
    const comfyUi = new FakeComfyUiClient();
    const first = await processV2AssetGenerationJob(queuePayload(), {
      jobs: repository,
      candidates: repository,
      comfyUi,
    }, { now: () => new Date("2026-08-12T03:01:00.000Z") });
    assert.equal(first.kind, "succeeded");
    const replay = await processV2AssetGenerationJob(queuePayload(), {
      jobs: repository,
      candidates: repository,
      comfyUi,
    }, { now: () => new Date("2026-08-12T03:02:00.000Z") });
    assert.equal(replay.kind, "skipped_terminal");
    assert.notEqual(first.candidateId, undefined);
    const candidate = await repository.getAssetCandidate(first.candidateId!);
    assert.equal(candidate?.candidateId, first.candidateId);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 asset worker treats retryable media store failures as recoverable work", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    await repository.createAssetJob(input({ maxAttempts: 2 }));
    const first = await processV2AssetGenerationJob(queuePayload(), {
      jobs: repository,
      candidates: repository,
      comfyUi: new HttpMediaComfyUiClient(),
      mediaStore: new FailingMediaStore(),
    }, { now: () => new Date("2026-08-12T03:03:00.000Z") });
    assert.equal(first.kind, "failed_retryable");
    assert.equal(first.job.status, "queued");
    assert.equal(first.job.attempts, 1);
    assert.equal(await repository.getAssetCandidate("candidate:asset:job_asset_bridge" as V2CandidateId), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 asset worker retries ComfyUI failures until attempts are exhausted", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    await repository.createAssetJob(input({ maxAttempts: 2 }));
    const first = await processV2AssetGenerationJob(queuePayload(), {
      jobs: repository,
      candidates: repository,
      comfyUi: new FailingComfyUiClient(),
    }, { now: () => new Date("2026-08-12T03:03:00.000Z") });
    assert.equal(first.kind, "failed_retryable");
    assert.equal(first.job.status, "queued");
    assert.equal(first.job.attempts, 1);
    const second = await processV2AssetGenerationJob(queuePayload(), {
      jobs: repository,
      candidates: repository,
      comfyUi: new FailingComfyUiClient(),
    }, { now: () => new Date("2026-08-12T03:04:00.000Z") });
    assert.equal(second.kind, "failed_terminal");
    assert.equal(second.job.status, "failed");
    assert.equal(second.job.attempts, 2);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 asset worker rejects unsafe media refs without creating candidates", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    await repository.createAssetJob(input());
    const result = await processV2AssetGenerationJob(queuePayload(), {
      jobs: repository,
      candidates: repository,
      comfyUi: new InvalidMediaComfyUiClient(),
    }, { now: () => new Date("2026-08-12T03:05:00.000Z") });
    assert.equal(result.kind, "failed_terminal");
    assert.equal(result.job.status, "failed");
    assert.equal(await repository.getAssetCandidate("candidate:asset:job_asset_bridge" as V2CandidateId), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 asset worker recovers expired leases and resumes existing external jobs", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    await repository.createAssetJob(input());
    await repository.markAssetJobClaimed({
      jobId: "job_asset_bridge" as V2JobId,
      claimedAt: "2026-08-12T03:01:00.000Z",
      leaseExpiresAt: "2026-08-12T03:02:00.000Z",
    });
    await repository.markAssetJobRunning({
      jobId: "job_asset_bridge" as V2JobId,
      updatedAt: "2026-08-12T03:01:30.000Z",
    });
    await repository.markAssetJobSubmitted({
      jobId: "job_asset_bridge" as V2JobId,
      submittedAt: "2026-08-12T03:01:40.000Z",
      externalJobId: "fake-comfy:existing-external",
    });
    const comfyUi = new ExistingExternalComfyUiClient();
    const result = await processV2AssetGenerationJob(queuePayload(), {
      jobs: repository,
      candidates: repository,
      comfyUi,
    }, { now: () => new Date("2026-08-12T03:03:00.000Z") });
    assert.equal(result.kind, "succeeded");
    assert.equal(comfyUi.submitCount, 0);
    assert.equal(result.job.mediaRef, "media://fake-comfy/recovered-asset.png");
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 asset worker rejects mismatched queue payloads", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const repository = new V2SqliteAssetGenerationRepository(db);
    await repository.createAssetJob(input());
    const result = await processV2AssetGenerationJob({
      ...queuePayload(),
      workflowVersion: "other-workflow",
    }, {
      jobs: repository,
      candidates: repository,
      comfyUi: new FakeComfyUiClient(),
    }, { now: () => new Date("2026-08-12T03:06:00.000Z") });
    assert.equal(result.kind, "failed_terminal");
    assert.equal(result.job.status, "failed");
  } finally {
    db.close();
    cleanup();
  }
});
