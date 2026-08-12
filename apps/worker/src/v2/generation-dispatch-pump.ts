import type {
  V2GenerationDispatchRecord,
  V2IsoDateTime,
} from "@living-network/contracts";
import type {
  V2AssetGenerationDispatchRepository,
  V2AssetGenerationJobQueuePayload,
  V2AssetGenerationJobRepository,
  V2GenerationDispatchRepository,
  V2GenerationJobQueuePayload,
  V2GenerationJobRepository,
} from "@living-network/ports";

export interface V2GenerationDispatchQueue<Data extends object> {
  enqueue(taskId: string, data: Data): Promise<void>;
}

export interface V2SceneGenerationDispatchPumpDependencies {
  readonly dispatches: V2GenerationDispatchRepository;
  readonly jobs: V2GenerationJobRepository;
  readonly queue: V2GenerationDispatchQueue<V2GenerationJobQueuePayload>;
}

export interface V2AssetGenerationDispatchPumpDependencies {
  readonly dispatches: V2AssetGenerationDispatchRepository;
  readonly jobs: V2AssetGenerationJobRepository;
  readonly queue: V2GenerationDispatchQueue<V2AssetGenerationJobQueuePayload>;
}

export interface V2GenerationDispatchPumpDependencies {
  readonly scene?: V2SceneGenerationDispatchPumpDependencies;
  readonly asset?: V2AssetGenerationDispatchPumpDependencies;
}

export interface V2GenerationDispatchPumpOptions {
  readonly batchSize?: number;
  readonly now?: () => Date;
}

export interface V2GenerationDispatchPumpResult {
  readonly sceneScanned: number;
  readonly sceneEnqueued: number;
  readonly sceneFailed: number;
  readonly assetScanned: number;
  readonly assetEnqueued: number;
  readonly assetFailed: number;
}

function iso(date: Date): V2IsoDateTime {
  return date.toISOString() as V2IsoDateTime;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function batchSize(value: number | undefined): number {
  const resolved = value ?? 100;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 1000) {
    throw new RangeError("batchSize must be an integer between 1 and 1000");
  }
  return resolved;
}

async function enqueueSceneDispatch(
  dispatch: V2GenerationDispatchRecord,
  dependencies: V2SceneGenerationDispatchPumpDependencies,
  enqueuedAt: V2IsoDateTime,
): Promise<boolean> {
  try {
    const job = await dependencies.jobs.getJob(dispatch.jobId);
    if (job === undefined) throw new Error(`V2 generation job not found for dispatch: ${dispatch.jobId}`);
    await dependencies.queue.enqueue(dispatch.dispatchId, {
      jobId: job.jobId,
      kind: "scene",
      contextHash: job.contextHash,
      correlationId: dispatch.dispatchId,
    });
    await dependencies.dispatches.markDispatchEnqueued({ dispatchId: dispatch.dispatchId, enqueuedAt });
    return true;
  } catch (error) {
    await dependencies.dispatches.recordDispatchFailure({
      dispatchId: dispatch.dispatchId,
      error: errorMessage(error),
    });
    return false;
  }
}

async function enqueueAssetDispatch(
  dispatch: V2GenerationDispatchRecord,
  dependencies: V2AssetGenerationDispatchPumpDependencies,
  enqueuedAt: V2IsoDateTime,
): Promise<boolean> {
  try {
    const job = await dependencies.jobs.getAssetJob(dispatch.jobId);
    if (job === undefined) throw new Error(`V2 asset generation job not found for dispatch: ${dispatch.jobId}`);
    await dependencies.queue.enqueue(dispatch.dispatchId, {
      jobId: job.jobId,
      kind: "asset",
      workflowVersion: job.workflowVersion,
      correlationId: dispatch.dispatchId,
    });
    await dependencies.dispatches.markAssetDispatchEnqueued({ dispatchId: dispatch.dispatchId, enqueuedAt });
    return true;
  } catch (error) {
    await dependencies.dispatches.recordAssetDispatchFailure({
      dispatchId: dispatch.dispatchId,
      error: errorMessage(error),
    });
    return false;
  }
}

export function createV2GenerationDispatchPump(
  dependencies: V2GenerationDispatchPumpDependencies,
  options: V2GenerationDispatchPumpOptions = {},
): { runOnce(): Promise<V2GenerationDispatchPumpResult> } {
  if (dependencies.scene === undefined && dependencies.asset === undefined) {
    throw new TypeError("at least one V2 generation dispatch dependency must be configured");
  }
  const limit = batchSize(options.batchSize);
  const now = options.now ?? (() => new Date());

  return {
    async runOnce(): Promise<V2GenerationDispatchPumpResult> {
      let sceneScanned = 0;
      let sceneEnqueued = 0;
      let sceneFailed = 0;
      let assetScanned = 0;
      let assetEnqueued = 0;
      let assetFailed = 0;
      const enqueuedAt = iso(now());

      if (dependencies.scene !== undefined) {
        const dispatches = await dependencies.scene.dispatches.listPendingDispatches(limit);
        sceneScanned = dispatches.length;
        for (const dispatch of dispatches) {
          if (await enqueueSceneDispatch(dispatch, dependencies.scene, enqueuedAt)) sceneEnqueued += 1;
          else sceneFailed += 1;
        }
      }

      if (dependencies.asset !== undefined) {
        const dispatches = await dependencies.asset.dispatches.listPendingAssetDispatches(limit);
        assetScanned = dispatches.length;
        for (const dispatch of dispatches) {
          if (await enqueueAssetDispatch(dispatch, dependencies.asset, enqueuedAt)) assetEnqueued += 1;
          else assetFailed += 1;
        }
      }

      return {
        sceneScanned,
        sceneEnqueued,
        sceneFailed,
        assetScanned,
        assetEnqueued,
        assetFailed,
      };
    },
  };
}
