import {
  applyMigrations,
  createPostgresSqlClient,
  createSqlRepositories,
  type PostgresSqlClient,
} from "@living-network/database";
import { loadAppConfig, type EnvironmentInput } from "@living-network/config";
import { ActiveProfileChatProvider, createProviderFromConfig, SecretCipher } from "@living-network/ai";
import {
  closeApiRuntime,
  createApiRuntime,
  listenApiRuntime,
  type ApiRuntime,
} from "./runtime.ts";
import { pathToFileURL } from "node:url";
import { createSqlInteractionLogRepository } from "@living-network/database";
import { createChatObservationLogHook, InteractionLogging } from "./interaction-logging.ts";

export interface PersistentApiRuntime {
  readonly runtime: ApiRuntime;
  readonly database: PostgresSqlClient;
}

export async function startPersistentApi(
  environment: EnvironmentInput = process.env,
): Promise<PersistentApiRuntime> {
  const config = loadAppConfig(environment);
  if (config.database.url.length === 0) {
    throw new Error("DATABASE_URL is required for the persistent API");
  }
  const database = await createPostgresSqlClient({ connectionString: config.database.url });
  try {
    await applyMigrations(database);
    const repositories = createSqlRepositories(database);
    const cipher = environment.INTEGRATION_SECRET_KEY === undefined
      ? undefined
      : new SecretCipher(environment.INTEGRATION_SECRET_KEY);
    const fallback = createProviderFromConfig({ ...config.llm });
    const interactionLogRepository = createSqlInteractionLogRepository(database);
    const interactionLogging = new InteractionLogging({ repository: interactionLogRepository });
    const provider = new ActiveProfileChatProvider(
      repositories.llmProviderProfiles,
      cipher,
      fallback,
      createChatObservationLogHook(interactionLogging),
    );
    const runtime = createApiRuntime(
      config,
      repositories,
      provider,
      {
        memoryRetrievalEnabled: config.flags.memoryRetrievalEnabled,
        memoryWriteEnabled: config.flags.memoryWriteEnabled,
      },
      { requireTrustedActor: true },
      { readiness: async () => { await database.query("SELECT 1"); }, creatorDispatchEnabled: true, interactionLogs: interactionLogRepository, interactionLogging, mediaRoot: config.media.root, ...(cipher === undefined ? {} : { secretCipher: cipher }) },
    );
    await listenApiRuntime(runtime);
    return { runtime, database };
  } catch (error) {
    await database.close();
    throw error;
  }
}

export async function stopPersistentApi(value: PersistentApiRuntime): Promise<void> {
  await closeApiRuntime(value.runtime);
  await value.database.close();
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  const running = await startPersistentApi().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
    return undefined;
  });
  if (running !== undefined) {
    const address = running.runtime.server.address();
    const location = typeof address === "string"
      ? address
      : address === null
        ? `${running.runtime.config.api.host}:${running.runtime.config.api.port}`
        : `${address.address}:${address.port}`;
    console.log(`Living Network API (PostgreSQL) listening on http://${location}`);
    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`Received ${signal}; closing persistent API`);
      await stopPersistentApi(running);
    };
    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
  }
}
