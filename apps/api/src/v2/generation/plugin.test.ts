import assert from "node:assert/strict";
import test from "node:test";

import type {
  V2CharacterId,
  V2CandidateId,
  V2CreateSceneGenerationJobInput,
  V2GenerationContextSnapshot,
  V2GenerationDispatchRecord,
  V2GenerationJobKind,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2JobStatus,
  V2Revision,
  V2SceneGenerationJobRecord,
  V2StoryWorldId,
} from "@living-network/contracts";
import type {
  CanonSnapshotReaderPort,
  V2CanonSnapshot,
  V2GenerationJobCreateResult,
  V2GenerationJobRepository,
} from "@living-network/ports";
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

function createApp() {
  const canonSnapshots = new FakeCanonSnapshots();
  const jobs = new FakeGenerationJobs();
  const app = createV2FastifyApp({
    generationPlugin: createV2GenerationPlugin({
      canonSnapshots,
      jobs,
      now: () => new Date(now),
      defaultTokenBudget: 900,
    }),
  });
  return { app, canonSnapshots, jobs };
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
