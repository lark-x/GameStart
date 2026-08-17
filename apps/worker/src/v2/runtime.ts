import type { DatabaseSync } from "node:sqlite";

import { SecretCipher } from "@living-network/ai";
import {
  getV2Migrations,
  openV2SqliteConnection,
  V2SqliteAssetGenerationRepository,
  V2SqliteCandidateSubmissionPort,
  V2SqliteChatMaintenanceJobRepository,
  V2SqliteChatUnitOfWork,
  V2SqliteGenerationJobRepository,
  V2SqlitePlatformRepository,
} from "@living-network/database/v2";
import { loadV2RuntimeConfig, type V2RuntimeConfig } from "@living-network/config/v2";
import type {
  V2AssetGenerationJobQueuePayload,
  V2GenerationJobQueuePayload,
} from "@living-network/ports/v2";

import { BullMqTaskQueue, BullMqTaskWorker, type TaskQueue } from "../queue.ts";
import { createV2GenerationDispatchPump } from "./generation-dispatch-pump.ts";
import { V2LocalAssetMediaStore } from "./local-asset-media-store.ts";
import { processV2AssetGenerationJob } from "./asset-generation-worker.ts";
import { processV2SceneGenerationJob } from "./scene-generation-worker.ts";
import { V2DynamicComfyUiClient } from "./dynamic-comfyui-client.ts";
import { processPendingMemoryExtractionJobs } from "./memory-extraction-worker.ts";
import { V2DynamicModelProvider } from "./model-provider.ts";

export interface V2WorkerProcess {
  stop(): Promise<void>;
}

function assertSchemaCurrent(db: DatabaseSync): void {
  let appliedRows: Array<{ id: string }>;
  try {
    appliedRows = db.prepare("SELECT id FROM v2_schema_migrations").all() as Array<{ id: string }>;
  } catch {
    throw new Error("V2 SQLite schema is not current; API must migrate first: v2_schema_migrations");
  }
  const applied = new Set(appliedRows.map((row) => row.id));
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

const MODEL_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MODEL_LOG_INTERRUPTION_MS = 10 * 60 * 1000;
const MODEL_LOG_MAINTENANCE_MS = 5 * 60 * 1000;

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
    const platformRepository = new V2SqlitePlatformRepository(db);
    const secretCipher = config.integrationSecretKey === undefined ? undefined : new SecretCipher(config.integrationSecretKey);
    let lastModelLogMaintenance = 0;
    const maintainModelLogs = async (): Promise<void> => {
      const current = new Date();
      await platformRepository.markInterruptedModelCalls(
        new Date(current.getTime() - MODEL_LOG_INTERRUPTION_MS).toISOString(),
        current.toISOString(),
      );
      await platformRepository.deleteModelCallLogsBefore(
        new Date(current.getTime() - MODEL_LOG_RETENTION_MS).toISOString(),
      );
      lastModelLogMaintenance = current.getTime();
    };
    await maintainModelLogs();

    const chatUnitOfWork = new V2SqliteChatUnitOfWork(db);
    const maintenanceJobs = new V2SqliteChatMaintenanceJobRepository(db);
    const memoryProvider = new V2DynamicModelProvider({
      repository: platformRepository,
      ...(secretCipher === undefined ? {} : { secretCipher }),
      fallback: {
        protocol: config.scene.protocol,
        ...(config.scene.baseUrl === undefined ? {} : { baseUrl: config.scene.baseUrl }),
        ...(config.scene.apiKey === undefined ? {} : { apiKey: config.scene.apiKey }),
        ...(config.scene.model === undefined ? {} : { model: config.scene.model }),
        timeoutMs: config.scene.timeoutMs,
      },
    });

    const scene = config.scene.enabled
      ? (() => {
        const provider = new V2DynamicModelProvider({
          repository: platformRepository,
          ...(secretCipher === undefined ? {} : { secretCipher }),
          fallback: {
            protocol: config.scene.protocol,
            ...(config.scene.baseUrl === undefined ? {} : { baseUrl: config.scene.baseUrl }),
            ...(config.scene.apiKey === undefined ? {} : { apiKey: config.scene.apiKey }),
            ...(config.scene.model === undefined ? {} : { model: config.scene.model }),
            timeoutMs: config.scene.timeoutMs,
          },
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
              comfyUi: new V2DynamicComfyUiClient({
                repository: platformRepository,
                fallback: {
                  ...(config.asset.baseUrl === undefined ? {} : { baseUrl: config.asset.baseUrl }),
                  timeoutMs: config.asset.timeoutMs,
                },
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
      await processPendingMemoryExtractionJobs({
        jobs: maintenanceJobs,
        unitOfWork: chatUnitOfWork,
        provider: memoryProvider,
      });
      if (Date.now() - lastModelLogMaintenance >= MODEL_LOG_MAINTENANCE_MS) {
        await maintainModelLogs();
      }
    };
    await tick();
    timer = setInterval(() => void tick().catch((error: unknown) => console.error("V2 dispatch pump failed", error)), config.dispatchTickMs);
    timer.unref();
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
