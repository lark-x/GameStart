import type { DatabaseSync } from "node:sqlite";

import { createV2ChatProvider } from "@living-network/ai/v2";
import {
  getV2Migrations,
  openV2SqliteConnection,
  V2SqliteAssetGenerationRepository,
  V2SqliteCandidateSubmissionPort,
  V2SqliteGenerationJobRepository,
} from "@living-network/database/v2";
import { loadV2RuntimeConfig, type V2RuntimeConfig } from "@living-network/config/v2";
import type {
  V2AssetGenerationJobQueuePayload,
  V2GenerationJobQueuePayload,
} from "@living-network/ports/v2";

import { BullMqTaskQueue, BullMqTaskWorker, type TaskQueue } from "../queue.ts";
import { ComfyUiHttpClient } from "../comfyui-client.ts";
import { createV2GenerationDispatchPump } from "./generation-dispatch-pump.ts";
import { V2LocalAssetMediaStore } from "./local-asset-media-store.ts";
import { processV2AssetGenerationJob } from "./asset-generation-worker.ts";
import { processV2SceneGenerationJob } from "./scene-generation-worker.ts";

export interface V2WorkerProcess {
  stop(): Promise<void>;
}

function assertSchemaCurrent(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM v2_schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  const missing = getV2Migrations().map((migration) => migration.id).filter((id) => !applied.has(id));
  if (missing.length > 0) throw new Error(`V2 SQLite schema is not current; API must migrate first: ${missing.join(", ")}`);
}

function sceneQueue(config: V2RuntimeConfig): TaskQueue<V2GenerationJobQueuePayload> {
  return new BullMqTaskQueue<V2GenerationJobQueuePayload>("v2-scene-generation", {
    url: config.redisUrl,
    prefix: config.queuePrefix,
  });
}

function assetQueue(config: V2RuntimeConfig): TaskQueue<V2AssetGenerationJobQueuePayload> {
  return new BullMqTaskQueue<V2AssetGenerationJobQueuePayload>("v2-asset-generation", {
    url: config.redisUrl,
    prefix: config.queuePrefix,
  });
}

export async function startV2Worker(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<V2WorkerProcess> {
  const config = loadV2RuntimeConfig(environment);
  const db = openV2SqliteConnection({ path: config.sqlitePath });
  const queues: Array<TaskQueue<object>> = [];
  const consumers: Array<{ close(): Promise<void> }> = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  try {
    assertSchemaCurrent(db);
    const sceneJobs = new V2SqliteGenerationJobRepository(db);
    const assetJobs = new V2SqliteAssetGenerationRepository(db);
    const candidateSubmission = new V2SqliteCandidateSubmissionPort(db);

    const scene = config.scene.enabled
      ? (() => {
        const provider = createV2ChatProvider({
          protocol: config.scene.protocol,
          baseUrl: config.scene.baseUrl!,
          ...(config.scene.apiKey === undefined ? {} : { apiKey: config.scene.apiKey }),
          model: config.scene.model!,
          timeoutMs: config.scene.timeoutMs,
        });
        const queue = sceneQueue(config);
        queues.push(queue);
        const consumer = new BullMqTaskWorker<V2GenerationJobQueuePayload, unknown>(
          "v2-scene-generation",
          { url: config.redisUrl, prefix: config.queuePrefix },
          async (payload) => {
            const result = await processV2SceneGenerationJob(payload, {
              jobs: sceneJobs,
              candidateSubmission,
              provider,
            });
            return result;
          },
          { concurrency: config.scene.concurrency },
        );
        consumers.push(consumer);
        return {
          dispatches: sceneJobs,
          jobs: sceneJobs,
          queue,
        };
      })()
      : undefined;

    const asset = config.asset.enabled
      ? (() => {
        const queue = assetQueue(config);
        queues.push(queue);
        const consumer = new BullMqTaskWorker<V2AssetGenerationJobQueuePayload, unknown>(
          "v2-asset-generation",
          { url: config.redisUrl, prefix: config.queuePrefix },
          async (payload) => {
            const result = await processV2AssetGenerationJob(payload, {
              jobs: assetJobs,
              candidates: assetJobs,
              comfyUi: new ComfyUiHttpClient({
                baseUrl: config.asset.baseUrl!,
                timeoutMs: config.asset.timeoutMs,
              }),
              mediaStore: new V2LocalAssetMediaStore({ mediaRoot: config.mediaRoot }),
            });
            return result;
          },
          { concurrency: config.asset.concurrency },
        );
        consumers.push(consumer);
        return {
          dispatches: assetJobs,
          jobs: assetJobs,
          queue,
        };
      })()
      : undefined;

    const pump = createV2GenerationDispatchPump({
      ...(scene === undefined ? {} : { scene }),
      ...(asset === undefined ? {} : { asset }),
    });
    const tick = async (): Promise<void> => {
      if (stopped) return;
      await pump.runOnce();
    };
    await tick();
    timer = setInterval(() => void tick().catch((error: unknown) => console.error("V2 dispatch pump failed", error)), config.dispatchTickMs);
    console.log(`Living Network V2 Worker started (scene=${config.scene.enabled}, asset=${config.asset.enabled})`);
    return {
      async stop(): Promise<void> {
        if (stopped) return;
        stopped = true;
        if (timer !== undefined) clearInterval(timer);
        for (const consumer of consumers) await consumer.close();
        for (const queue of queues) await queue.close();
        db.close();
      },
    };
  } catch (error) {
    for (const consumer of consumers) await consumer.close().catch(() => undefined);
    for (const queue of queues) await queue.close().catch(() => undefined);
    db.close();
    throw error;
  }
}
