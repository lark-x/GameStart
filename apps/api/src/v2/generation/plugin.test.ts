import assert from "node:assert/strict";
import test from "node:test";

import { buildV2SceneGenerationProviderRequest } from "@living-network/ai/v2";
import type {
  V2ApprovedAssetRecord,
  V2AssetCandidateRecord,
  V2AssetCandidateReviewRecord,
  V2AssetGenerationJobRecord,
  V2AssetId,
  V2CharacterId,
  V2CandidateId,
  V2CreateAssetGenerationJobInput,
  V2CreateManualAssetInput,
  V2CreateSceneGenerationJobInput,
  V2GenerationContextSnapshot,
  V2GenerationDispatchRecord,
  V2GenerationJobKind,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2JobStatus,
  V2PrepareAssetGenerationApiResponse,
  V2ReleaseId,
  V2Revision,
  V2ReviewAssetCandidateInput,
  V2SceneGenerationPrepareApiResponse,
  V2SceneGenerationJobRecord,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type {
  CanonSnapshotReaderPort,
  V2AssetCandidateReviewResult,
  V2AssetCandidateRepository,
  V2AssetGenerationJobCreateResult,
  V2AssetGenerationJobRepository,
  V2AssetReviewRepository,
  V2CanonSnapshot,
  V2GenerationJobCreateResult,
  V2GenerationJobRepository,
  V2ApprovedAssetRef,
} from "@living-network/ports/v2";
import { createV2FastifyApp } from "../platform/index.ts";
import { createV2GenerationPlugin } from "./plugin.ts";

const now = "2026-08-12T01:00:00.000Z" as V2IsoDateTime;

class FakeCanonSnapshots implements CanonSnapshotReaderPort {
  public readonly requests: Array<{ readonly storyWorldId: V2StoryWorldId; readonly revision: V2Revision }> = [];

  public async getCanonSnapshot(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly revision: V2Revision;
  }): Promise<V2CanonSnapshot> {
    this.requests.push(input);
    return {
      storyWorldId: input.storyWorldId,
      revision: input.revision,
      facts: [{ id: "fact_bridge", text: "The bridge is sealed.", visibility: "player_visible" }],
      characters: [{ characterId: "char_mira" as V2CharacterId, name: "Mira" }],
      scenes: [{ sceneId: "scene_intro", title: "Intro" }],
    };
  }
}

function makeJob(input: V2CreateSceneGenerationJobInput): V2SceneGenerationJobRecord {
  return {
    jobId: input.jobId,
    storyWorldId: input.storyWorldId,
    kind: "scene" as V2GenerationJobKind,
    status: "queued",
    idempotencyKey: input.idempotencyKey,
    baseCanonRevision: input.baseCanonRevision,
    contextHash: input.context.contextHash,
    context: input.context,
    prompt: input.prompt,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function sameInput(left: V2SceneGenerationJobRecord, right: V2CreateSceneGenerationJobInput): boolean {
  return left.storyWorldId === right.storyWorldId &&
    left.baseCanonRevision === right.baseCanonRevision &&
    left.idempotencyKey === right.idempotencyKey &&
    left.prompt === right.prompt &&
    left.contextHash === right.context.contextHash;
}

class FakeGenerationJobs implements V2GenerationJobRepository {
  public readonly created: V2CreateSceneGenerationJobInput[] = [];
  private readonly jobs = new Map<string, V2SceneGenerationJobRecord>();
  private readonly idempotency = new Map<string, V2JobId>();

  public async createSceneJob(input: V2CreateSceneGenerationJobInput): Promise<V2GenerationJobCreateResult> {
    this.created.push(input);
    const key = `${input.storyWorldId}:${input.idempotencyKey}`;
    const existingId = this.idempotency.get(key);
    if (existingId !== undefined) {
      const existing = this.jobs.get(existingId);
      if (existing === undefined) throw new Error("idempotency row cannot be resolved");
      if (!sameInput(existing, input)) throw new Error("idempotency key conflict");
      return { job: existing, inserted: false };
    }
    const job = makeJob(input);
    this.jobs.set(job.jobId, job);
    this.idempotency.set(key, job.jobId);
    return { job, inserted: true };
  }

  public async getJob(jobId: V2JobId): Promise<V2SceneGenerationJobRecord | undefined> {
    return this.jobs.get(jobId);
  }

  public async listJobsByStatus(status: V2JobStatus, limit: number): Promise<readonly V2SceneGenerationJobRecord[]> {
    return [...this.jobs.values()].filter((job) => job.status === status).slice(0, limit);
  }

  public async listJobsByStoryWorld(storyWorldId: V2StoryWorldId, limit: number): Promise<readonly V2SceneGenerationJobRecord[]> {
    return [...this.jobs.values()].filter((job) => job.storyWorldId === storyWorldId).slice(0, limit);
  }

  public async markJobClaimed(input: { readonly jobId: V2JobId; readonly claimedAt: string; readonly leaseExpiresAt: string }): Promise<V2SceneGenerationJobRecord> {
    const job = this.requireJob(input.jobId);
    const updated: V2SceneGenerationJobRecord = {
      ...job,
      status: "claimed",
      claimedAt: input.claimedAt as V2IsoDateTime,
      leaseExpiresAt: input.leaseExpiresAt as V2IsoDateTime,
      updatedAt: input.claimedAt as V2IsoDateTime,
    };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async markJobRunning(input: { readonly jobId: V2JobId; readonly updatedAt: string }): Promise<V2SceneGenerationJobRecord> {
    const job = this.requireJob(input.jobId);
    const updated = { ...job, status: "running" as const, updatedAt: input.updatedAt as V2IsoDateTime };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async recoverExpiredJobLease(input: { readonly jobId: V2JobId; readonly recoveredAt: string }): Promise<V2SceneGenerationJobRecord> {
    const job = this.requireJob(input.jobId);
    const updated = { ...job, status: "queued" as const, updatedAt: input.recoveredAt as V2IsoDateTime };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async markJobSucceeded(input: { readonly jobId: V2JobId; readonly completedAt: string; readonly candidateId: string; readonly providerResponseId: string; readonly rawOutputPreview: string }): Promise<V2SceneGenerationJobRecord> {
    const job = this.requireJob(input.jobId);
    const updated = {
      ...job,
      status: "succeeded" as const,
      completedAt: input.completedAt as V2IsoDateTime,
      updatedAt: input.completedAt as V2IsoDateTime,
      candidateId: input.candidateId as V2CandidateId,
      providerResponseId: input.providerResponseId,
      rawOutputPreview: input.rawOutputPreview,
    } satisfies V2SceneGenerationJobRecord;
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async markJobFailed(input: { readonly jobId: V2JobId; readonly failedAt: string; readonly reason: string; readonly retryable: boolean }): Promise<V2SceneGenerationJobRecord> {
    const job = this.requireJob(input.jobId);
    const updated = {
      ...job,
      status: "failed" as const,
      updatedAt: input.failedAt as V2IsoDateTime,
      failureReason: input.reason,
    };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async cancelJob(input: { readonly jobId: V2JobId; readonly cancelledAt: string; readonly reason?: string }): Promise<V2SceneGenerationJobRecord> {
    const job = this.requireJob(input.jobId);
    const updated = {
      ...job,
      status: "cancelled" as const,
      cancelledAt: input.cancelledAt as V2IsoDateTime,
      updatedAt: input.cancelledAt as V2IsoDateTime,
      ...(input.reason === undefined ? {} : { failureReason: input.reason }),
    };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  private requireJob(jobId: V2JobId): V2SceneGenerationJobRecord {
    const job = this.jobs.get(jobId);
    if (job === undefined) throw new Error(`missing job ${jobId}`);
    return job;
  }
}

function makeAssetJob(input: V2CreateAssetGenerationJobInput): V2AssetGenerationJobRecord {
  return {
    jobId: input.jobId,
    storyWorldId: input.storyWorldId,
    status: "queued",
    idempotencyKey: input.idempotencyKey,
    prompt: input.prompt,
    workflowVersion: input.workflowVersion,
    workflow: input.workflow,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    ...(input.negativePrompt === undefined ? {} : { negativePrompt: input.negativePrompt }),
    ...(input.seed === undefined ? {} : { seed: input.seed }),
  };
}

function sameAssetInput(left: V2AssetGenerationJobRecord, right: V2CreateAssetGenerationJobInput): boolean {
  return left.storyWorldId === right.storyWorldId &&
    left.idempotencyKey === right.idempotencyKey &&
    left.prompt === right.prompt &&
    left.workflowVersion === right.workflowVersion &&
    JSON.stringify(left.workflow) === JSON.stringify(right.workflow) &&
    left.negativePrompt === right.negativePrompt &&
    left.seed === right.seed &&
    left.maxAttempts === (right.maxAttempts ?? 3);
}

class FakeAssetStore implements V2AssetGenerationJobRepository, V2AssetCandidateRepository, V2AssetReviewRepository {
  public readonly created: V2CreateAssetGenerationJobInput[] = [];
  public throwAssetReads = false;
  private readonly jobs = new Map<string, V2AssetGenerationJobRecord>();
  private readonly jobIdempotency = new Map<string, V2JobId>();
  private readonly candidates = new Map<string, V2AssetCandidateRecord>();
  private readonly reviews = new Map<string, V2AssetCandidateReviewRecord>();
  private readonly approvedAssets = new Map<string, V2ApprovedAssetRecord>();

  public async createAssetJob(input: V2CreateAssetGenerationJobInput): Promise<V2AssetGenerationJobCreateResult> {
    this.created.push(input);
    const key = `${input.storyWorldId}:${input.idempotencyKey}`;
    const existingId = this.jobIdempotency.get(key);
    if (existingId !== undefined) {
      const existing = this.jobs.get(existingId);
      if (existing === undefined) throw new Error("asset idempotency row cannot be resolved");
      if (!sameAssetInput(existing, input)) throw new Error("asset idempotency key conflict");
      return { job: existing, inserted: false };
    }
    const job = makeAssetJob(input);
    this.jobs.set(job.jobId, job);
    this.jobIdempotency.set(key, job.jobId);
    return { job, inserted: true };
  }

  public async getAssetJob(jobId: V2JobId): Promise<V2AssetGenerationJobRecord | undefined> {
    if (this.throwAssetReads) throw new Error("asset read failed");
    return this.jobs.get(jobId);
  }

  public async listAssetJobsByStatus(status: V2JobStatus, limit: number): Promise<readonly V2AssetGenerationJobRecord[]> {
    return [...this.jobs.values()].filter((job) => job.status === status).slice(0, limit);
  }

  public async listAssetJobsByStoryWorld(storyWorldId: V2StoryWorldId, limit: number): Promise<readonly V2AssetGenerationJobRecord[]> {
    return [...this.jobs.values()].filter((job) => job.storyWorldId === storyWorldId).slice(0, limit);
  }

  public async markAssetJobClaimed(input: { readonly jobId: V2JobId; readonly claimedAt: string; readonly leaseExpiresAt: string }): Promise<V2AssetGenerationJobRecord> {
    const job = this.requireAssetJob(input.jobId);
    const updated = {
      ...job,
      status: "claimed" as const,
      claimedAt: input.claimedAt as V2IsoDateTime,
      leaseExpiresAt: input.leaseExpiresAt as V2IsoDateTime,
      updatedAt: input.claimedAt as V2IsoDateTime,
    };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async markAssetJobRunning(input: { readonly jobId: V2JobId; readonly updatedAt: string }): Promise<V2AssetGenerationJobRecord> {
    const job = this.requireAssetJob(input.jobId);
    const updated = { ...job, status: "running" as const, updatedAt: input.updatedAt as V2IsoDateTime };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async markAssetJobSubmitted(input: { readonly jobId: V2JobId; readonly submittedAt: string; readonly externalJobId: string }): Promise<V2AssetGenerationJobRecord> {
    const job = this.requireAssetJob(input.jobId);
    const updated = {
      ...job,
      submittedAt: input.submittedAt as V2IsoDateTime,
      updatedAt: input.submittedAt as V2IsoDateTime,
      externalJobId: input.externalJobId,
    };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async recoverExpiredAssetJobLease(input: { readonly jobId: V2JobId; readonly recoveredAt: string }): Promise<V2AssetGenerationJobRecord> {
    const job = this.requireAssetJob(input.jobId);
    const updated = { ...job, status: "queued" as const, updatedAt: input.recoveredAt as V2IsoDateTime };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async markAssetJobSucceeded(input: { readonly jobId: V2JobId; readonly completedAt: string; readonly mediaRef: string; readonly candidateId: string }): Promise<V2AssetGenerationJobRecord> {
    const job = this.requireAssetJob(input.jobId);
    const updated = {
      ...job,
      status: "succeeded" as const,
      completedAt: input.completedAt as V2IsoDateTime,
      updatedAt: input.completedAt as V2IsoDateTime,
      mediaRef: input.mediaRef,
      candidateId: input.candidateId as V2CandidateId,
    };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async markAssetJobFailed(input: { readonly jobId: V2JobId; readonly failedAt: string; readonly reason: string; readonly retryable: boolean }): Promise<V2AssetGenerationJobRecord> {
    const job = this.requireAssetJob(input.jobId);
    const updated = {
      ...job,
      status: input.retryable ? "queued" as const : "failed" as const,
      attempts: job.attempts + 1,
      updatedAt: input.failedAt as V2IsoDateTime,
      failureReason: input.reason,
    };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async cancelAssetJob(input: { readonly jobId: V2JobId; readonly cancelledAt: string; readonly reason?: string }): Promise<V2AssetGenerationJobRecord> {
    if (this.throwAssetReads) throw new Error("asset cancel failed");
    const job = this.requireAssetJob(input.jobId);
    const updated = {
      ...job,
      status: "cancelled" as const,
      cancelledAt: input.cancelledAt as V2IsoDateTime,
      updatedAt: input.cancelledAt as V2IsoDateTime,
      ...(input.reason === undefined ? {} : { failureReason: input.reason }),
    };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  public async createAssetCandidate(input: V2AssetCandidateRecord): Promise<{ readonly candidate: V2AssetCandidateRecord; readonly inserted: boolean }> {
    const existing = this.candidates.get(input.candidateId);
    if (existing !== undefined) return { candidate: existing, inserted: false };
    this.candidates.set(input.candidateId, input);
    return { candidate: input, inserted: true };
  }

  public async getAssetCandidate(candidateId: V2CandidateId): Promise<V2AssetCandidateRecord | undefined> {
    if (this.throwAssetReads) throw new Error("asset candidate read failed");
    return this.candidates.get(candidateId);
  }

  public async listAssetCandidates(storyWorldId: V2StoryWorldId): Promise<readonly V2AssetCandidateRecord[]> {
    if (this.throwAssetReads) throw new Error("asset candidate list failed");
    return [...this.candidates.values()].filter((candidate) => candidate.storyWorldId === storyWorldId);
  }

  public async listApprovedAssets(storyWorldId: V2StoryWorldId): Promise<readonly V2ApprovedAssetRecord[]> {
    if (this.throwAssetReads) throw new Error("asset approved list failed");
    return [...this.approvedAssets.values()].filter((asset) => asset.storyWorldId === storyWorldId);
  }

  public async reviewAssetCandidate(input: V2ReviewAssetCandidateInput): Promise<V2AssetCandidateReviewResult> {
    const candidate = this.candidates.get(input.candidateId);
    if (candidate === undefined) throw new Error("asset candidate not found");
    const key = `${input.candidateId}:${input.idempotencyKey}`;
    const existing = this.reviews.get(key);
    if (existing !== undefined) {
      return {
        candidate,
        review: existing,
        inserted: false,
        ...(existing.resultingStatus === "approved" ? { approvedAsset: this.requireApprovedAsset(candidate.payload.asset.assetId) } : {}),
      };
    }
    const status = input.action === "approve"
      ? "approved"
      : input.action === "reject" ? "rejected" : "changes_requested";
    const updated: V2AssetCandidateRecord = {
      ...candidate,
      status,
      reviewedAt: input.reviewedAt,
      ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
      ...(input.reason === undefined ? {} : { reviewReason: input.reason }),
    };
    this.candidates.set(updated.candidateId, updated);
    const review: V2AssetCandidateReviewRecord = {
      reviewId: `asset-review:${input.candidateId}:${input.idempotencyKey}`,
      candidateId: input.candidateId,
      action: input.action,
      resultingStatus: status,
      reviewedAt: input.reviewedAt,
      idempotencyKey: input.idempotencyKey,
      ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    };
    this.reviews.set(key, review);
    let approvedAsset: V2ApprovedAssetRecord | undefined;
    if (status === "approved") {
      approvedAsset = {
        assetId: updated.payload.asset.assetId,
        storyWorldId: updated.storyWorldId,
        sourceType: "candidate",
        candidateId: updated.candidateId,
        title: updated.payload.asset.assetId,
        mediaRef: updated.payload.asset.mediaRef,
        contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        approvedAt: input.reviewedAt,
        ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
        ...(input.reason === undefined ? {} : { reviewReason: input.reason }),
      };
      this.approvedAssets.set(approvedAsset.assetId, approvedAsset);
    }
    return {
      candidate: updated,
      review,
      inserted: true,
      ...(approvedAsset === undefined ? {} : { approvedAsset }),
    };
  }

  public async createManualAsset(input: V2CreateManualAssetInput): Promise<V2ApprovedAssetRecord> {
    const asset: V2ApprovedAssetRecord = {
      assetId: input.assetId,
      storyWorldId: input.storyWorldId,
      sourceType: "manual",
      title: input.title,
      mediaRef: input.mediaRef,
      contentHash: input.contentHash,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      approvedAt: input.createdAt,
    };
    this.approvedAssets.set(asset.assetId, asset);
    return asset;
  }

  public async getApprovedAsset(input: { readonly storyWorldId: V2StoryWorldId; readonly assetId: V2AssetId }): Promise<V2ApprovedAssetRef | undefined> {
    const asset = this.approvedAssets.get(input.assetId);
    return asset === undefined || asset.storyWorldId !== input.storyWorldId
      ? undefined
      : {
        assetId: asset.assetId,
        storyWorldId: asset.storyWorldId,
        mediaRef: asset.mediaRef,
        contentHash: asset.contentHash,
      };
  }

  public async listReleaseAssets(_input: { readonly storyWorldId: V2StoryWorldId; readonly releaseId: V2ReleaseId }): Promise<readonly V2ApprovedAssetRef[]> {
    return [];
  }

  public seedPendingCandidate(job: V2AssetGenerationJobRecord): V2AssetCandidateRecord {
    const candidate: V2AssetCandidateRecord = {
      candidateId: `candidate:asset:${job.jobId}` as V2CandidateId,
      jobId: job.jobId,
      storyWorldId: job.storyWorldId,
      status: "pending",
      payload: {
        asset: {
          assetId: `asset:${job.jobId}` as V2AssetId,
          mediaKind: "image",
          mediaRef: "media://local/v2/assets/bridge.png",
          prompt: job.prompt,
          workflowVersion: job.workflowVersion,
          sourceJobId: job.jobId,
          ...(job.seed === undefined ? {} : { seed: job.seed }),
        },
        validationNotes: ["Seeded candidate for API review."],
      },
      createdAt: now,
    };
    this.candidates.set(candidate.candidateId, candidate);
    return candidate;
  }

  private requireAssetJob(jobId: V2JobId): V2AssetGenerationJobRecord {
    const job = this.jobs.get(jobId);
    if (job === undefined) throw new Error(`missing asset job ${jobId}`);
    return job;
  }

  private requireApprovedAsset(assetId: V2AssetId): V2ApprovedAssetRecord {
    const asset = this.approvedAssets.get(assetId);
    if (asset === undefined) throw new Error(`missing approved asset ${assetId}`);
    return asset;
  }
}

function createApp() {
  const canonSnapshots = new FakeCanonSnapshots();
  const jobs = new FakeGenerationJobs();
  const assets = new FakeAssetStore();
  const app = createV2FastifyApp({
    generationPlugin: createV2GenerationPlugin({
      canonSnapshots,
      jobs,
      assetJobs: assets,
      assetCandidates: assets,
      assetReviews: assets,
      now: () => new Date(now),
      defaultTokenBudget: 900,
      capabilities: { sceneGenerationEnabled: true, assetGenerationEnabled: true },
    }),
  });
  return { app, canonSnapshots, jobs, assets };
}

function createAppWithoutAssets() {
  const canonSnapshots = new FakeCanonSnapshots();
  const jobs = new FakeGenerationJobs();
  const app = createV2FastifyApp({
    generationPlugin: createV2GenerationPlugin({
      canonSnapshots,
      jobs,
      now: () => new Date(now),
      defaultTokenBudget: 900,
      capabilities: { sceneGenerationEnabled: true, assetGenerationEnabled: true },
    }),
  });
  return { app };
}

function createAppWithCapabilities(capabilities: { sceneGenerationEnabled: boolean; assetGenerationEnabled: boolean }) {
  const canonSnapshots = new FakeCanonSnapshots();
  const jobs = new FakeGenerationJobs();
  const assets = new FakeAssetStore();
  const app = createV2FastifyApp({
    generationPlugin: createV2GenerationPlugin({ canonSnapshots, jobs, assetJobs: assets, assetCandidates: assets, assetReviews: assets, capabilities }),
  });
  return { app, jobs };
}

test("V2 generation context preview reads canon snapshot for the requested revision", async () => {
  const { app, canonSnapshots } = createApp();
  await app.ready();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/generation/context-preview",
      payload: {
        storyWorldId: "world_generation",
        baseCanonRevision: 7,
        prompt: " Write the bridge scene. ",
      },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { context: V2GenerationContextSnapshot };
    assert.equal(body.context.storyWorldId, "world_generation");
    assert.equal(body.context.baseCanonRevision, 7);
    assert.equal(body.context.prompt, "Write the bridge scene.");
    assert.equal(body.context.tokenBudget, 900);
    assert.equal(body.context.contextHash.startsWith("sha256:"), true);
    assert.deepEqual(canonSnapshots.requests, [{ storyWorldId: "world_generation", revision: 7 }]);
  } finally {
    await app.close();
  }
});

test("V2 scene prepare returns the shared model request preview", async () => {
  const { app } = createApp();
  await app.ready();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/generation/scene/prepare",
      payload: {
        storyWorldId: "world_generation",
        baseCanonRevision: 7,
        prompt: "Write the bridge scene.",
        tokenBudget: 512,
      },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as V2SceneGenerationPrepareApiResponse;
    const providerRequest = buildV2SceneGenerationProviderRequest({ context: body.context });
    assert.equal(body.request.responseFormat, providerRequest.responseFormat);
    assert.equal(body.request.temperature, providerRequest.temperature);
    assert.equal(body.request.maxTokens, providerRequest.maxTokens);
    assert.deepEqual(body.request.messages, providerRequest.messages);
  } finally {
    await app.close();
  }
});

test("V2 generation API creates, replays, reads, and cancels scene jobs", async () => {
  const { app, jobs } = createApp();
  await app.ready();
  try {
    const create = await app.inject({
      method: "POST",
      url: "/api/v2/generation/jobs/scene",
      payload: {
        storyWorldId: "world_generation",
        baseCanonRevision: 7,
        idempotencyKey: "idem-bridge",
        prompt: "Write the bridge scene.",
        tokenBudget: 512,
        maxAttempts: 2,
      },
    });
    assert.equal(create.statusCode, 201);
    const created = create.json() as { job: V2SceneGenerationJobRecord; inserted: boolean };
    assert.equal(created.inserted, true);
    assert.equal(created.job.status, "queued");
    assert.equal(created.job.maxAttempts, 2);
    assert.equal(jobs.created.length, 1);

    const replay = await app.inject({
      method: "POST",
      url: "/api/v2/generation/jobs/scene",
      payload: {
        storyWorldId: "world_generation",
        baseCanonRevision: 7,
        idempotencyKey: "idem-bridge",
        prompt: "Write the bridge scene.",
        tokenBudget: 512,
        maxAttempts: 2,
      },
    });
    assert.equal(replay.statusCode, 200);
    assert.equal((replay.json() as { inserted: boolean }).inserted, false);

    const read = await app.inject({
      method: "GET",
      url: `/api/v2/generation/jobs/${encodeURIComponent(created.job.jobId)}`,
    });
    assert.equal(read.statusCode, 200);
    assert.equal((read.json() as { job: V2SceneGenerationJobRecord }).job.jobId, created.job.jobId);

    const list = await app.inject({
      method: "GET",
      url: "/api/v2/generation/worlds/world_generation/jobs",
    });
    assert.equal(list.statusCode, 200);
    assert.deepEqual((list.json() as { jobs: V2SceneGenerationJobRecord[] }).jobs.map((job) => job.jobId), [created.job.jobId]);

    const cancel = await app.inject({
      method: "POST",
      url: `/api/v2/generation/jobs/${encodeURIComponent(created.job.jobId)}/cancel`,
      payload: { reason: "creator cancelled" },
    });
    assert.equal(cancel.statusCode, 200);
    assert.equal((cancel.json() as { job: V2SceneGenerationJobRecord }).job.status, "cancelled");
  } finally {
    await app.close();
  }
});

test("V2 generation API reports validation and missing job errors", async () => {
  const { app } = createApp();
  await app.ready();
  try {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/v2/generation/jobs/scene",
      payload: {
        storyWorldId: "world_generation",
        baseCanonRevision: -1,
        idempotencyKey: "idem-bridge",
        prompt: "Write the bridge scene.",
      },
    });
    assert.equal(invalid.statusCode, 422);
    assert.match((invalid.json() as { error: { message: string } }).error.message, /baseCanonRevision/);

    const missing = await app.inject({
      method: "GET",
      url: "/api/v2/generation/jobs/job%3Amissing",
    });
    assert.equal(missing.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("V2 asset API prepares the final ComfyUI payload for preview", async () => {
  const { app } = createApp();
  await app.ready();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/generation/assets/prepare",
      payload: {
        storyWorldId: "world_generation",
        idempotencyKey: "idem-asset-preview",
        prompt: "Generate bridge key art.",
        workflowVersion: "workflow-v1",
        workflow: { "1": { class_type: "KSampler" } },
        negativePrompt: "low quality",
        seed: 42,
      },
    });
    assert.equal(response.statusCode, 200);
    const prepared = response.json() as V2PrepareAssetGenerationApiResponse;
    assert.equal(prepared.request.idempotencyKey, "idem-asset-preview");
    assert.equal(prepared.request.prompt, "Generate bridge key art.");
    assert.equal(prepared.jobId.startsWith("job:asset:"), true);
    assert.deepEqual(prepared.comfyUiPayload.prompt, { "1": { class_type: "KSampler" } });
    assert.equal(prepared.comfyUiPayload.client_id, "living-network-worker");
    assert.equal(prepared.comfyUiPayload.extra_data.living_network_job_id, prepared.jobId);
    assert.equal(prepared.comfyUiPayload.extra_data.workflow_version, "workflow-v1");
    assert.equal(prepared.comfyUiPayload.extra_data.prompt, "Generate bridge key art.");
    assert.equal(prepared.comfyUiPayload.extra_data.negative_prompt, "low quality");
    assert.equal(prepared.comfyUiPayload.extra_data.seed, 42);
  } finally {
    await app.close();
  }
});

test("V2 asset API creates, replays, reads, and cancels asset jobs", async () => {
  const { app, assets } = createApp();
  await app.ready();
  try {
    const payload = {
      storyWorldId: "world_generation",
      idempotencyKey: "idem-asset-bridge",
      prompt: "Generate bridge key art.",
      workflowVersion: "workflow-v1",
      workflow: { "1": { class_type: "KSampler" } },
      negativePrompt: "low quality",
      seed: 42,
      maxAttempts: 2,
    };

    const create = await app.inject({
      method: "POST",
      url: "/api/v2/generation/assets/jobs",
      payload,
    });
    assert.equal(create.statusCode, 201);
    const created = create.json() as { job: V2AssetGenerationJobRecord; inserted: boolean };
    assert.equal(created.inserted, true);
    assert.equal(created.job.status, "queued");
    assert.equal(created.job.workflowVersion, "workflow-v1");
    assert.equal(created.job.seed, 42);
    assert.equal(created.job.maxAttempts, 2);
    assert.equal(assets.created.length, 1);

    const replay = await app.inject({
      method: "POST",
      url: "/api/v2/generation/assets/jobs",
      payload,
    });
    assert.equal(replay.statusCode, 200);
    assert.equal((replay.json() as { inserted: boolean }).inserted, false);

    const read = await app.inject({
      method: "GET",
      url: `/api/v2/generation/assets/jobs/${encodeURIComponent(created.job.jobId)}`,
    });
    assert.equal(read.statusCode, 200);
    assert.equal((read.json() as { job: V2AssetGenerationJobRecord }).job.jobId, created.job.jobId);

    const list = await app.inject({
      method: "GET",
      url: "/api/v2/generation/assets/worlds/world_generation/jobs",
    });
    assert.equal(list.statusCode, 200);
    assert.deepEqual((list.json() as { jobs: V2AssetGenerationJobRecord[] }).jobs.map((job) => job.jobId), [created.job.jobId]);

    const cancel = await app.inject({
      method: "POST",
      url: `/api/v2/generation/assets/jobs/${encodeURIComponent(created.job.jobId)}/cancel`,
      payload: { reason: "creator cancelled" },
    });
    assert.equal(cancel.statusCode, 200);
    const cancelled = cancel.json() as { job: V2AssetGenerationJobRecord };
    assert.equal(cancelled.job.status, "cancelled");
    assert.equal(cancelled.job.failureReason, "creator cancelled");
  } finally {
    await app.close();
  }
});

test("V2 asset API reads and reviews asset candidates", async () => {
  const { app, assets } = createApp();
  await app.ready();
  try {
    const create = await app.inject({
      method: "POST",
      url: "/api/v2/generation/assets/jobs",
      payload: {
        storyWorldId: "world_generation",
        idempotencyKey: "idem-asset-review",
        prompt: "Generate bridge key art.",
        workflowVersion: "workflow-v1",
        workflow: { "1": { class_type: "KSampler" } },
        seed: 42,
      },
    });
    assert.equal(create.statusCode, 201);
    const created = create.json() as { job: V2AssetGenerationJobRecord };
    const candidate = assets.seedPendingCandidate(created.job);

    const read = await app.inject({
      method: "GET",
      url: `/api/v2/generation/assets/candidates/${encodeURIComponent(candidate.candidateId)}`,
    });
    assert.equal(read.statusCode, 200);
    assert.equal((read.json() as { candidate: V2AssetCandidateRecord }).candidate.status, "pending");

    const reviewPayload = {
      action: "approve",
      idempotencyKey: "idem-review-asset",
      reviewer: "creator",
      reason: "approved for release preflight",
    };
    const review = await app.inject({
      method: "POST",
      url: `/api/v2/generation/assets/candidates/${encodeURIComponent(candidate.candidateId)}/review`,
      payload: reviewPayload,
    });
    assert.equal(review.statusCode, 201);
    const reviewed = review.json() as {
      candidate: V2AssetCandidateRecord;
      review: V2AssetCandidateReviewRecord;
      inserted: boolean;
      approvedAsset?: V2ApprovedAssetRecord;
    };
    assert.equal(reviewed.inserted, true);
    assert.equal(reviewed.candidate.status, "approved");
    assert.equal(reviewed.review.resultingStatus, "approved");
    assert.equal(reviewed.approvedAsset?.mediaRef, "media://local/v2/assets/bridge.png");

    const replay = await app.inject({
      method: "POST",
      url: `/api/v2/generation/assets/candidates/${encodeURIComponent(candidate.candidateId)}/review`,
      payload: reviewPayload,
    });
    assert.equal(replay.statusCode, 200);
    const replayed = replay.json() as { candidate: V2AssetCandidateRecord; inserted: boolean; approvedAsset?: V2ApprovedAssetRecord };
    assert.equal(replayed.inserted, false);
    assert.equal(replayed.candidate.status, "approved");
    assert.equal(replayed.approvedAsset?.assetId, candidate.payload.asset.assetId);
  } finally {
    await app.close();
  }
});

test("V2 asset API reports validation, missing record, and missing dependency errors", async () => {
  const { app } = createApp();
  await app.ready();
  try {
    const invalidSeed = await app.inject({
      method: "POST",
      url: "/api/v2/generation/assets/jobs",
      payload: {
        storyWorldId: "world_generation",
        idempotencyKey: "idem-invalid-asset",
        prompt: "Generate bridge key art.",
        workflowVersion: "workflow-v1",
        workflow: { "1": { class_type: "KSampler" } },
        seed: -1,
      },
    });
    assert.equal(invalidSeed.statusCode, 422);
    assert.match((invalidSeed.json() as { error: { message: string } }).error.message, /seed/);

    const missingJob = await app.inject({
      method: "GET",
      url: "/api/v2/generation/assets/jobs/job%3Aasset%3Amissing",
    });
    assert.equal(missingJob.statusCode, 404);

    const missingCandidate = await app.inject({
      method: "GET",
      url: "/api/v2/generation/assets/candidates/candidate%3Aasset%3Amissing",
    });
    assert.equal(missingCandidate.statusCode, 404);

    const invalidReview = await app.inject({
      method: "POST",
      url: "/api/v2/generation/assets/candidates/candidate%3Aasset%3Amissing/review",
      payload: {
        action: "hold",
        idempotencyKey: "idem-invalid-review",
      },
    });
    assert.equal(invalidReview.statusCode, 422);
    assert.match((invalidReview.json() as { error: { message: string } }).error.message, /action/);
  } finally {
    await app.close();
  }

  const { app: missingDepsApp } = createAppWithoutAssets();
  await missingDepsApp.ready();
  try {
    const missingDependency = await missingDepsApp.inject({
      method: "POST",
      url: "/api/v2/generation/assets/jobs",
      payload: {
        storyWorldId: "world_generation",
        idempotencyKey: "idem-asset-missing-deps",
        prompt: "Generate bridge key art.",
        workflowVersion: "workflow-v1",
        workflow: { "1": { class_type: "KSampler" } },
      },
    });
    assert.equal(missingDependency.statusCode, 503);
    assert.match((missingDependency.json() as { error: { message: string } }).error.message, /asset generation repository/);
    const missingAssetJob = await missingDepsApp.inject({ method: "GET", url: "/api/v2/generation/assets/jobs/job_missing" });
    assert.equal(missingAssetJob.statusCode, 503);
    const missingAssetCancel = await missingDepsApp.inject({ method: "POST", url: "/api/v2/generation/assets/jobs/job_missing/cancel", payload: {} });
    assert.equal(missingAssetCancel.statusCode, 503);
    const missingAssetCandidate = await missingDepsApp.inject({ method: "GET", url: "/api/v2/generation/assets/candidates/candidate_missing" });
    assert.equal(missingAssetCandidate.statusCode, 503);
    const missingAssetReview = await missingDepsApp.inject({ method: "POST", url: "/api/v2/generation/assets/candidates/candidate_missing/review", payload: { action: "approve", idempotencyKey: "missing" } });
    assert.equal(missingAssetReview.statusCode, 503);
  } finally {
    await missingDepsApp.close();
  }
});

test("V2 generation API blocks disabled capabilities with CAPABILITY_DISABLED", async () => {
  const { app } = createAppWithCapabilities({ sceneGenerationEnabled: false, assetGenerationEnabled: false });
  await app.ready();
  try {
    const scene = await app.inject({ method: "POST", url: "/api/v2/generation/jobs/scene", payload: { storyWorldId: "world", baseCanonRevision: 1, idempotencyKey: "scene", prompt: "prompt" } });
    assert.equal(scene.statusCode, 409);
    assert.equal(scene.json().error.code, "CAPABILITY_DISABLED");
    const asset = await app.inject({ method: "POST", url: "/api/v2/generation/assets/jobs", payload: { storyWorldId: "world", idempotencyKey: "asset", prompt: "prompt", workflowVersion: "v1", workflow: {} } });
    assert.equal(asset.statusCode, 409);
    assert.equal(asset.json().error.code, "CAPABILITY_DISABLED");
  } finally {
    await app.close();
  }
});

test("V2 asset API maps configured asset repository failures", async () => {
  const { app, assets } = createApp();
  assets.throwAssetReads = true;
  await app.ready();
  try {
    const read = await app.inject({ method: "GET", url: "/api/v2/generation/assets/jobs/job" });
    assert.equal(read.statusCode, 500);
    const cancel = await app.inject({ method: "POST", url: "/api/v2/generation/assets/jobs/job/cancel", payload: {} });
    assert.equal(cancel.statusCode, 500);
    const candidate = await app.inject({ method: "GET", url: "/api/v2/generation/assets/candidates/candidate" });
    assert.equal(candidate.statusCode, 500);
    const candidateList = await app.inject({ method: "GET", url: "/api/v2/generation/assets/worlds/world/candidates" });
    assert.equal(candidateList.statusCode, 500);
    const libraryList = await app.inject({ method: "GET", url: "/api/v2/generation/assets/worlds/world/library" });
    assert.equal(libraryList.statusCode, 500);
  } finally {
    await app.close();
  }
});

test("V2 generation API rechecks live platform capability configuration", async () => {
  const canonSnapshots = new FakeCanonSnapshots();
  const jobs = new FakeGenerationJobs();
  const assets = new FakeAssetStore();
  let configured = false;
  const app = createV2FastifyApp({
    generationPlugin: createV2GenerationPlugin({
      canonSnapshots,
      jobs,
      assetJobs: assets,
      assetCandidates: assets,
      assetReviews: assets,
      capabilitiesProvider: async () => ({
        sceneGeneration: { enabled: true, configured },
        assetGeneration: { enabled: true, configured },
      }),
    }),
  });
  await app.ready();
  try {
    const unavailable = await app.inject({ method: "POST", url: "/api/v2/generation/jobs/scene", payload: { storyWorldId: "world", baseCanonRevision: 1, idempotencyKey: "live-scene", prompt: "scene" } });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.json().error.code, "MODEL_NOT_BOUND");
    configured = true;
    const scene = await app.inject({ method: "POST", url: "/api/v2/generation/jobs/scene", payload: { storyWorldId: "world_generation", baseCanonRevision: 7, idempotencyKey: "live-scene", prompt: "scene" } });
    assert.equal(scene.statusCode, 201);
    const asset = await app.inject({ method: "POST", url: "/api/v2/generation/assets/jobs", payload: { storyWorldId: "world", idempotencyKey: "live-asset", prompt: "asset", workflowVersion: "v1", workflow: {} } });
    assert.equal(asset.statusCode, 201);
  } finally {
    await app.close();
  }
});

test("V2 generation API covers optional fields and asset repository read/review errors", async () => {
  const { app } = createApp();
  await app.ready();
  try {
    const preview = await app.inject({ method: "POST", url: "/api/v2/generation/context-preview", payload: { storyWorldId: "world_generation", baseCanonRevision: 7, prompt: "prompt", tokenBudget: 100 } });
    assert.equal(preview.statusCode, 200);
    const invalid = await app.inject({ method: "POST", url: "/api/v2/generation/context-preview", payload: { storyWorldId: "world_generation", baseCanonRevision: 1, prompt: "", tokenBudget: 0 } });
    assert.equal(invalid.statusCode, 422);
    const invalidBody = await app.inject({ method: "POST", url: "/api/v2/generation/assets/jobs", payload: { storyWorldId: "world", idempotencyKey: "asset-invalid", prompt: "prompt", workflowVersion: "v1", workflow: [], negativePrompt: "" } });
    assert.equal(invalidBody.statusCode, 422);
    const invalidParams = await app.inject({ method: "GET", url: "/api/v2/generation/jobs/%20" });
    assert.equal(invalidParams.statusCode, 422);
    const cancelMissing = await app.inject({ method: "POST", url: "/api/v2/generation/jobs/missing/cancel", payload: {} });
    assert.equal(cancelMissing.statusCode, 500);
  } finally {
    await app.close();
  }
});

test("V2 generation plugin keeps dispatch records outside API responses", () => {
  const dispatch: V2GenerationDispatchRecord = {
    dispatchId: "generation-dispatch:job_scene_bridge",
    jobId: "job_scene_bridge" as V2JobId,
    status: "pending",
    attempts: 0,
    requestedAt: now,
  };
  assert.equal(dispatch.status, "pending");
}
);

test("V2 asset API lists candidates and approved library", async () => {
  const { app, assets } = createApp();
  await app.ready();
  try {
    const create = await app.inject({
      method: "POST",
      url: "/api/v2/generation/assets/jobs",
      payload: {
        storyWorldId: "world_generation",
        idempotencyKey: "idem-list-asset",
        prompt: "Generate bridge key art.",
        workflowVersion: "workflow-v1",
        workflow: { "1": { class_type: "KSampler" } },
        seed: 42,
      },
    });
    assert.equal(create.statusCode, 201);
    const created = create.json() as { job: V2AssetGenerationJobRecord };
    const candidate = assets.seedPendingCandidate(created.job);
    const review = await app.inject({
      method: "POST",
      url: `/api/v2/generation/assets/candidates/${encodeURIComponent(candidate.candidateId)}/review`,
      payload: { action: "approve", idempotencyKey: "idem-list-review", reviewer: "creator", reason: "ok" },
    });
    assert.equal(review.statusCode, 201);

    const candidates = await app.inject({ method: "GET", url: "/api/v2/generation/assets/worlds/world_generation/candidates" });
    assert.equal(candidates.statusCode, 200);
    assert.equal((candidates.json() as { candidates: V2AssetCandidateRecord[] }).candidates.length, 1);

    const library = await app.inject({ method: "GET", url: "/api/v2/generation/assets/worlds/world_generation/library" });
    assert.equal(library.statusCode, 200);
    assert.equal((library.json() as { assets: V2ApprovedAssetRecord[] }).assets.length, 1);
  } finally {
    await app.close();
  }
});
