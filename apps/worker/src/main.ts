import { pathToFileURL } from "node:url";

import { createInMemoryRepositories } from "@living-network/database";
import { createWorkerRuntime } from "./runtime.ts";

export interface WorkerProcess {
  readonly stop: () => Promise<void>;
}

/**
 * Starts the dependency-free worker shell. A persistent repository and queue
 * are injected by the production worker adapter; this shell intentionally
 * performs no work when no story world is configured.
 */
export function startDevelopmentWorker(): WorkerProcess {
  const repositories = createInMemoryRepositories();
  const worker = createWorkerRuntime(repositories);
  const intervalMs = Number(process.env.WORKER_TICK_MS ?? "60000");
  const timer = Number.isSafeInteger(intervalMs) && intervalMs >= 1000
    ? setInterval(() => {
      if (process.env.WORKER_STORY_WORLD_ID === undefined) return;
      const now = new Date();
      const from = new Date(now.getTime() - intervalMs).toISOString();
      void worker.runCycle({
        storyWorldId: process.env.WORKER_STORY_WORLD_ID,
        window: { from, to: now.toISOString() },
        execution: { ruleVersion: process.env.WORKER_RULE_VERSION ?? "dev-v1" },
      }).catch((error: unknown) => console.error("Worker cycle failed", error));
    }, intervalMs)
    : undefined;
  if (timer !== undefined) timer.unref();
  console.log("Living Network Worker started (development repository)");
  return {
    async stop(): Promise<void> {
      if (timer !== undefined) clearInterval(timer);
      console.log("Living Network Worker stopped");
    },
  };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const worker = startDevelopmentWorker();
  let stopping = false;
  const stop = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log(`Received ${signal}; closing worker`);
    await worker.stop();
  };
  process.once("SIGINT", () => void stop("SIGINT"));
  process.once("SIGTERM", () => void stop("SIGTERM"));
}
