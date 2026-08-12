import { pathToFileURL } from "node:url";

import { createV2ApiRuntime } from "./platform/index.ts";

async function main(): Promise<void> {
  const port = Number(process.env.V2_API_PORT ?? 3002);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("V2_API_PORT must be a valid port");
  const runtime = createV2ApiRuntime({ sqlitePath: process.env.V2_SQLITE_PATH ?? ".data/living-network-v2.sqlite" });
  try {
    await runtime.app.listen({ host: "127.0.0.1", port });
    console.log(`Living Network V2 API listening on http://127.0.0.1:${port}`);
  } catch (error) {
    await runtime.close();
    throw error;
  }
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await runtime.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
