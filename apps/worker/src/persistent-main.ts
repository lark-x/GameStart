import { pathToFileURL } from "node:url";

import {
  checkSchemaCurrent,
  createSqlInteractionLogRepository,
  createPostgresSqlClient,
  createSqlRepositories,
} from "@living-network/database";
import { loadAppConfig, type EnvironmentInput } from "@living-network/config";
import { BullMqTaskQueue, BullMqTaskWorker } from "./queue.ts";
import { createDispatchPump } from "./dispatch-pump.ts";
import { OutboxPublisher, type OutboxQueueTask } from "./outbox-publisher.ts";
import { createImageJobPump } from "./image-job-pump.ts";
import {
  createWorkerRuntime,
  materializeAndEnqueue,
  processWorkerOccurrence,
  type WorkerOccurrenceTask,
} from "./runtime.ts";
import { bestEffortLog, type WorkerLogger } from "./interaction-log.ts";

export interface PersistentWorkerProcess {
  readonly stop: () => Promise<void>;
}

export async function startPersistentWorker(
  environment: EnvironmentInput = process.env,
  options: { readonly interactionLogs?: WorkerLogger | undefined } = {},
): Promise<PersistentWorkerProcess> {
  const workerId = environment.WORKER_ID ?? "living-network-worker";
  let logger = options.interactionLogs;
  await bestEffortLog(logger, { event: "worker.lifecycle", phase: "start", outcome: "BEGIN", correlationId: "worker:" + workerId, workerId });
  const config = loadAppConfig(environment);
  if (config.database.url.length === 0) {
    throw new Error("DATABASE_URL is required for persistent worker");
  }

  const database = await createPostgresSqlClient({
    connectionString: config.database.url,
  });
  const occurrenceQueue = new BullMqTaskQueue<WorkerOccurrenceTask>(
    "living-network-occurrences",
    {
      url: config.redis.url,
      prefix: "living-network",
    },
  );
  const outboxQueue = new BullMqTaskQueue<OutboxQueueTask>("living-network-outbox", {
    url: config.redis.url,
    prefix: "living-network",
  });

  try {
    await checkSchemaCurrent(database);
    const repositories = createSqlRepositories(database);
    logger ??= createSqlInteractionLogRepository(database);
    const runtime = createWorkerRuntime(repositories, { logger });

    const dispatchPump = createDispatchPump(
      repositories.dispatchRequests,
      occurrenceQueue,
      { workerId, logger },
    );
    const imageJobPump = config.flags.imageGenerationEnabled
      ? createImageJobPump(repositories, {
          fallbackSettings: config.comfyui,
          mediaRoot: config.media.root,
          logger,
        })
      : undefined;
    const occurrenceWorker = new BullMqTaskWorker<WorkerOccurrenceTask, string>(
      "living-network-occurrences",
      { url: config.redis.url, prefix: "living-network" },
      async (task) => processWorkerOccurrence(runtime, task),
      { concurrency: 2, logger },
    );
    const outboxPublisher = new OutboxPublisher(
      repositories.outboxEvents,
      outboxQueue,
    );
    const tickMs = Number(environment.WORKER_TICK_MS ?? "30000");
    if (!Number.isSafeInteger(tickMs) || tickMs < 1000) {
      throw new RangeError("WORKER_TICK_MS must be at least 1000");
    }

    const tick = async (): Promise<void> => {
      const now = new Date();
      const from = new Date(now.getTime() - tickMs).toISOString();
      const to = new Date(now.getTime() + tickMs).toISOString();
      for (const world of await repositories.storyWorlds.list()) {
        await materializeAndEnqueue(runtime, occurrenceQueue, {
          storyWorldId: world.id,
          window: { from, to },
          execution: {
            ruleVersion: environment.WORKER_RULE_VERSION ?? "rules-v1",
          },
        });
      }
      await dispatchPump.runOnce();
      await outboxPublisher.publishBatch(100);
      if (imageJobPump) await imageJobPump.runOnce();
    };

    let stopping = false;
    let nextTimer: ReturnType<typeof setTimeout> | undefined;
    let currentTick: Promise<void> | undefined;

    const scheduleNext = (): void => {
      if (stopping) return;
      nextTimer = setTimeout(() => {
        currentTick = tick().catch((error: unknown) => {
          console.error("worker tick failed", error);
        }).finally(() => {
          currentTick = undefined;
          scheduleNext();
        });
      }, tickMs);
      nextTimer.unref();
    };

    // Initial tick, then schedule subsequent ticks
    currentTick = tick().catch((error: unknown) => {
      console.error("worker tick failed", error);
    }).finally(() => {
      currentTick = undefined;
      scheduleNext();
    });

    return {
      async stop(): Promise<void> {
        stopping = true;
        if (nextTimer !== undefined) clearTimeout(nextTimer);
        if (currentTick !== undefined) await currentTick.catch(() => undefined);
        await bestEffortLog(logger, { event: "worker.lifecycle", phase: "stop", outcome: "BEGIN", correlationId: "worker:" + workerId, workerId });
        await occurrenceWorker.close();
        await dispatchPump.heartbeat("STOPPED");
        await occurrenceQueue.close();
        await outboxQueue.close();
        await database.close();
      },
    };
  } catch (error) {
    await bestEffortLog(logger, { event: "worker.lifecycle", phase: "exception", outcome: "FAILED", correlationId: "worker:" + workerId, workerId, previewMessage: error instanceof Error ? error.message : String(error) });
    await occurrenceQueue.close();
    await outboxQueue.close();
    await database.close();
    throw error;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
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