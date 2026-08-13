import { pathToFileURL } from "node:url";

import { startV2Worker, type V2WorkerProcess } from "./v2/runtime.ts";

export async function startWorker(): Promise<V2WorkerProcess> {
  return startV2Worker();
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const worker = await startWorker();
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
