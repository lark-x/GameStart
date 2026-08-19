import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadV2RuntimeConfig } from "@living-network/config/v2";

import { createV2ApiRuntime } from "./platform/index.ts";

/**
 * Load the repository-root `.env` file without overriding already-set
 * environment variables. The API runs from apps/api via pnpm filters, so
 * relative `--env-file` paths would depend on the working directory; this
 * loader resolves the root from the module location instead.
 */
function loadRepositoryDotEnv(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1);
  }
}

async function main(): Promise<void> {
  loadRepositoryDotEnv();
  const config = loadV2RuntimeConfig(process.env);
  const runtime = createV2ApiRuntime({
    sqlitePath: config.sqlitePath,
    mediaRoot: config.mediaRoot,
    capabilities: {
      sceneGeneration: { enabled: config.scene.enabled },
      assetGeneration: { enabled: config.asset.enabled },
    },
    ...(config.integrationSecretKey === undefined ? {} : { integrationSecretKey: config.integrationSecretKey }),
    ...(config.scene.baseUrl !== undefined && config.scene.model !== undefined ? {
      chatEnvironment: {
        protocol: config.scene.protocol,
        baseUrl: config.scene.baseUrl,
        ...(config.scene.apiKey === undefined ? {} : { apiKey: config.scene.apiKey }),
        model: config.scene.model,
        timeoutMs: config.scene.timeoutMs,
      },
    } : {}),
    environmentSceneConfigured: config.scene.baseUrl !== undefined &&
      config.scene.model !== undefined &&
      (config.scene.protocol !== "anthropic" || config.scene.apiKey !== undefined),
    environmentAssetConfigured: config.asset.baseUrl !== undefined,
  });
  try {
    await runtime.app.listen({ host: config.api.host, port: config.api.port });
    console.log(`Living Network V2 API listening on http://${config.api.host}:${config.api.port}`);
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
