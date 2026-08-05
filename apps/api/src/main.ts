import { pathToFileURL } from "node:url";

import {
  closeApiRuntime,
  createApiRuntimeFromEnvironment,
  listenApiRuntime,
  type ApiRuntime,
} from "./runtime.ts";
import { createDevelopmentRepositories } from "./dev-seed.ts";

export interface DevelopmentApiOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly portOverride?: number;
}

function environmentFromProcess(): Readonly<Record<string, string | undefined>> {
  return process.env;
}

function developmentEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  return {
    ...environment,
    DATABASE_URL: environment.DATABASE_URL ?? "postgresql://127.0.0.1/living_network_dev",
  };
}

/** Start the dependency-free development API with explicit seed data. */
export async function startDevelopmentApi(
  options: DevelopmentApiOptions = {},
): Promise<ApiRuntime> {
  const runtime = createApiRuntimeFromEnvironment(
    developmentEnvironment(options.environment ?? environmentFromProcess()),
    createDevelopmentRepositories(),
  );
  if (options.portOverride === undefined) {
    await listenApiRuntime(runtime);
  } else {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        runtime.server.off("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        runtime.server.off("error", onError);
        resolve();
      };
      runtime.server.once("error", onError);
      runtime.server.once("listening", onListening);
      runtime.server.listen(options.portOverride, runtime.config.api.host);
    });
  }
  return runtime;
}

export async function stopDevelopmentApi(runtime: ApiRuntime): Promise<void> {
  await closeApiRuntime(runtime);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

async function main(): Promise<void> {
  const runtime = await startDevelopmentApi();
  const address = runtime.server.address();
  const location = typeof address === "string"
    ? address
    : address === null
      ? `${runtime.config.api.host}:${runtime.config.api.port}`
      : `${address.address}:${address.port}`;
  console.log(`Living Network API listening on http://${location}`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; closing API`);
    await stopDevelopmentApi(runtime);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

if (isMainModule()) {
  await main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
