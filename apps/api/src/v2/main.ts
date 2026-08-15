import { pathToFileURL } from "node:url";

import { loadV2RuntimeConfig } from "@living-network/config/v2";

import { createV2ApiRuntime } from "./platform/index.ts";

async function main(): Promise<void> {
  const config = loadV2RuntimeConfig(process.env);
  const runtime = createV2ApiRuntime({
    sqlitePath: config.sqlitePath,
    mediaRoot: config.mediaRoot,
    capabilities: {
      sceneGeneration: { enabled: config.scene.enabled },
      assetGeneration: { enabled: config.asset.enabled },
    },
    ...(config.integrationSecretKey === undefined ? {} : { integrationSecretKey: config.integrationSecretKey }),
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
