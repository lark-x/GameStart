import assert from "node:assert/strict";
import test from "node:test";

import type {
  V2AssetGenerationJobRecord,
  V2CharacterId,
  V2CreateAssetGenerationJobInput,
  V2CreateSceneGenerationJobInput,
  V2GenerationContextSnapshot,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2Revision,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  V2SqliteAssetGenerationRepository,
  V2SqliteGenerationJobRepository,
  v2GenerationJobMigrations,
} from "@living-network/database/v2";
import type {
  V2AssetGenerationJobQueuePayload,
  V2GenerationJobQueuePayload,
} from "@living-network/ports/v2";
import type { V2GenerationDispatchRecord } from "@living-network/contracts/v2";
import type { V2GenerationJobRepository } from "@living-network/ports/v2";
import { createV2GenerationDispatchPump, type V2GenerationDispatchQueue } from "./generation-dispatch-pump.ts";

const now = "2026-08-12T03:00:00.000Z" as V2IsoDateTime;

function context(): V2GenerationContextSnapshot {
  return {
    storyWorldId: "world_generation" as V2StoryWorldId,
    baseCanonRevision: 1 as V2Revision,
    requestedAt: now,
    prompt: "Write the bridge scene.",
    promptPreview: "Write the bridge scene.",
    tokenBudget: 512,
    contextHash: "sha256:generation-context",
    sourceFactIds: ["fact-bridge"],
    sourceCharacterIds: ["char_mira" as V2CharacterId],
    sourceSceneIds: ["scene_intro"],
    facts: [{ id: "fact-bridge", text: "The bridge is sealed.", visibility: "player_visible" }],
    characters: [{ characterId: "char_mira" as V2CharacterId, name: "Mira" }],
    scenes: [{ sceneId: "scene_intro", title: "Intro" }],
  };
}

function sceneInput(): V2CreateSceneGenerationJobInput {
  return {
    jobId: "job_scene_bridge" as V2JobId,
    storyWorldId: "world_generation" as V2StoryWorldId,
    baseCanonRevision: 1 as V2Revision,
    idempotencyKey: "idem-scene-bridge" as V2IdempotencyKey,
    prompt: "Write the bridge scene.",
    context: context(),
    createdAt: now,
  };
}

function assetInput(): V2CreateAssetGenerationJobInput {
  return {
    jobId: "job_asset_bridge" as V2JobId,
    storyWorldId: "world_generation" as V2StoryWorldId,
    idempotencyKey: "idem-asset-bridge" as V2IdempotencyKey,
    prompt: "Generate bridge key art.",
    workflowVersion: "workflow-v1",
    workflow: { "1": { class_type: "KSampler" } },
    createdAt: now,
    seed: 42,
  };
}

class CapturingQueue<Data extends object> implements V2GenerationDispatchQueue<Data> {
  public readonly jobs: Array<{ readonly taskId: string; readonly data: Data }> = [];

  public async enqueue(taskId: string, data: Data): Promise<void> {
    this.jobs.push({ taskId, data });
  }
}

class FailingQueue<Data extends object> implements V2GenerationDispatchQueue<Data> {
  public async enqueue(): Promise<void> {
    throw new Error("redis down");
  }
}

test("V2 generation dispatch pump enqueues scene and asset payloads from SQLite outbox", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const sceneRepository = new V2SqliteGenerationJobRepository(db);
    const assetRepository = new V2SqliteAssetGenerationRepository(db);
    await sceneRepository.createSceneJob(sceneInput());
    const asset = await assetRepository.createAssetJob(assetInput());
    const sceneQueue = new CapturingQueue<V2GenerationJobQueuePayload>();
    const assetQueue = new CapturingQueue<V2AssetGenerationJobQueuePayload>();

    const pump = createV2GenerationDispatchPump({
      scene: {
        dispatches: sceneRepository,
        jobs: sceneRepository,
        queue: sceneQueue,
      },
      asset: {
        dispatches: assetRepository,
        jobs: assetRepository,
        queue: assetQueue,
      },
    }, {
      now: () => new Date("2026-08-12T03:01:00.000Z"),
    });

    const result = await pump.runOnce();
    assert.deepEqual(result, {
      sceneScanned: 1,
      sceneEnqueued: 1,
      sceneFailed: 0,
      assetScanned: 1,
      assetEnqueued: 1,
      assetFailed: 0,
    });
    assert.equal(sceneQueue.jobs[0]?.taskId, "generation-dispatch:job_scene_bridge:attempt:0");
    assert.deepEqual(sceneQueue.jobs[0]?.data, {
      jobId: "job_scene_bridge",
      kind: "scene",
      contextHash: "sha256:generation-context",
      correlationId: "generation-dispatch:job_scene_bridge",
    });
    assert.equal(assetQueue.jobs[0]?.taskId, "asset-dispatch:job_asset_bridge:attempt:0");
    assert.deepEqual(assetQueue.jobs[0]?.data, {
      jobId: asset.job.jobId,
      kind: "asset",
      workflowVersion: "workflow-v1",
      correlationId: "asset-dispatch:job_asset_bridge",
    });
    assert.equal((await sceneRepository.listPendingDispatches(10)).length, 0);
    assert.equal((await assetRepository.listPendingAssetDispatches(10)).length, 0);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 generation dispatch pump keeps failed enqueue work pending", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db, v2GenerationJobMigrations);
    const assetRepository = new V2SqliteAssetGenerationRepository(db);
    const asset = await assetRepository.createAssetJob(assetInput());
    const pump = createV2GenerationDispatchPump({
      asset: {
        dispatches: assetRepository,
        jobs: assetRepository,
        queue: new FailingQueue<V2AssetGenerationJobQueuePayload>(),
      },
    }, {
      now: () => new Date("2026-08-12T03:01:00.000Z"),
    });

    const result = await pump.runOnce();
    assert.equal(result.assetScanned, 1);
    assert.equal(result.assetEnqueued, 0);
    assert.equal(result.assetFailed, 1);
    const pending = await assetRepository.listPendingAssetDispatches(10);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.jobId, asset.job.jobId);
    assert.equal(pending[0]?.attempts, 1);
    assert.equal(pending[0]?.lastError, "redis down");
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 generation dispatch pump reports missing jobs and queue failures", async () => {
  const missingJobRepository = { getJob: async () => undefined } as unknown as V2GenerationJobRepository;
  const queueJobRepository = { getJob: async () => ({ jobId: "job_queue", attempts: 0, contextHash: "hash", kind: "scene" }) } as unknown as V2GenerationJobRepository;
  const noOpDispatch = (input: { readonly dispatchId: string; readonly enqueuedAt: string }): Promise<V2GenerationDispatchRecord> => Promise.resolve({
    dispatchId: input.dispatchId,
    jobId: "job" as V2JobId,
    status: "enqueued",
    attempts: 0,
    requestedAt: now,
    enqueuedAt: input.enqueuedAt as V2IsoDateTime,
  });
  const failedDispatch = (input: { readonly dispatchId: string; readonly error: string }): Promise<V2GenerationDispatchRecord> => {
    assert.match(input.error, /not found|queue unavailable/);
    return Promise.resolve({ dispatchId: input.dispatchId, jobId: "job" as V2JobId, status: "pending", attempts: 1, requestedAt: now, lastError: input.error });
  };
  const missing = createV2GenerationDispatchPump({
    scene: {
      dispatches: {
        listPendingDispatches: async () => [{ dispatchId: "dispatch_missing", jobId: "missing" as V2JobId, status: "pending", attempts: 0, requestedAt: now }],
        markDispatchEnqueued: noOpDispatch,
        recordDispatchFailure: failedDispatch,
      },
      jobs: missingJobRepository,
      queue: { enqueue: async () => undefined },
    },
  });
  assert.deepEqual(await missing.runOnce(), { sceneScanned: 1, sceneEnqueued: 0, sceneFailed: 1, assetScanned: 0, assetEnqueued: 0, assetFailed: 0 });

  const queueFailure = createV2GenerationDispatchPump({
    scene: {
      dispatches: {
        listPendingDispatches: async () => [{ dispatchId: "dispatch_queue", jobId: "job_queue" as V2JobId, status: "pending", attempts: 0, requestedAt: now }],
        markDispatchEnqueued: noOpDispatch,
        recordDispatchFailure: failedDispatch,
      },
      jobs: queueJobRepository,
      queue: { enqueue: async () => { throw new Error("queue unavailable"); } },
    },
  });
  assert.equal((await queueFailure.runOnce()).sceneFailed, 1);
});

test("V2 generation dispatch pump allows both generation lanes to be disabled", () => {
  const pump = createV2GenerationDispatchPump({});
  return pump.runOnce().then((result) => assert.deepEqual(result, {
    sceneScanned: 0,
    sceneEnqueued: 0,
    sceneFailed: 0,
    assetScanned: 0,
    assetEnqueued: 0,
    assetFailed: 0,
  }));
});

test("V2 generation dispatch pump validates batch size", () => {
  assert.throws(() => createV2GenerationDispatchPump({}, { batchSize: 0 }), /batchSize/);
  assert.throws(() => createV2GenerationDispatchPump({}, { batchSize: 1001 }), /batchSize/);
});
