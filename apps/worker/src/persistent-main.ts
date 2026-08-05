import { pathToFileURL } from "node:url";

import { applyMigrations, createPostgresSqlClient, createSqlRepositories } from "../../../packages/database/src/index.ts";
import { loadAppConfig, type EnvironmentInput } from "../../../packages/config/src/index.ts";
import { BullMqTaskQueue, BullMqTaskWorker } from "./queue.ts";
import { OutboxPublisher, type OutboxQueueTask } from "./outbox-publisher.ts";
import {
  createWorkerRuntime,
  materializeAndEnqueue,
  processWorkerOccurrence,
  type WorkerOccurrenceTask,
} from "./runtime.ts";

export interface PersistentWorkerProcess {
  readonly stop: () => Promise<void>;
}

export async function startPersistentWorker(
  environment: EnvironmentInput = process.env,
): Promise<PersistentWorkerProcess> {
  const config = loadAppConfig(environment);
  if (config.database.url.length === 0) throw new Error("DATABASE_URL is required for persistent worker");
  const database = await createPostgresSqlClient({ connectionString: config.database.url });
  const occurrenceQueue = new BullMqTaskQueue<WorkerOccurrenceTask>("living-network-occurrences", {
    url: config.redis.url,
    prefix: "living-network",
  });
  const outboxQueue = new BullMqTaskQueue<OutboxQueueTask>("living-network-outbox", {
    url: config.redis.url,
    prefix: "living-network",
  });
  try {
    await applyMigrations(database);
    const repositories = createSqlRepositories(database);
    const runtime = createWorkerRuntime(repositories);
    const occurrenceWorker = new BullMqTaskWorker<WorkerOccurrenceTask, string>(
      "living-network-occurrences",
      { url: config.redis.url, prefix: "living-network" },
      (task) => processWorkerOccurrence(runtime, task),
      { concurrency: 2 },
    );
    const outboxPublisher = repositories.outboxEvents === undefined
      ? undefined
      : new OutboxPublisher(repositories.outboxEvents, outboxQueue);
    const tickMs = Number(environment.WORKER_TICK_MS ?? "30000");
    if (!Number.isSafeInteger(tickMs) || tickMs < 1000) throw new RangeError("WORKER_TICK_MS must be at least 1000");
    const tick = async (): Promise<void> => {
      const now = new Date();
      const from = new Date(now.getTime() - tickMs).toISOString();
      const to = new Date(now.getTime() + tickMs).toISOString();
      for (const world of await repositories.storyWorlds.list()) {
        await materializeAndEnqueue(runtime, occurrenceQueue, {
          storyWorldId: world.id,
          window: { from, to },
          execution: { ruleVersion: environment.WORKER_RULE_VERSION ?? "rules-v1" },
        });
      }
      if (outboxPublisher) await outboxPublisher.publishBatch(100);
    };
    const timer = setInterval(() => void tick().catch((error: unknown) => console.error("worker tick failed", error)), tickMs);
    timer.unref();
    await tick();
    return {
      async stop(): Promise<void> {
        clearInterval(timer);
        await occurrenceWorker.close();
        await occurrenceQueue.close();
        await outboxQueue.close();
        await database.close();
      },
    };
  } catch (error) {
    await occurrenceQueue.close();
    await outboxQueue.close();
    await database.close();
    throw error;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const processHandle = await startPersistentWorker().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
    return undefined;
  });
  if (processHandle !== undefined) {
    let stopping = false;
    const stop = async (signal: string): Promise<void> => {
      if (stopping) return;
      stopping = true;
      console.log(`Received ${signal}; closing persistent worker`);
      await processHandle.stop();
    };
    process.once("SIGINT", () => void stop("SIGINT"));
    process.once("SIGTERM", () => void stop("SIGTERM"));
    console.log("Living Network Worker (PostgreSQL + Redis) started");
  }
}
