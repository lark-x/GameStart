import type { DatabaseSync } from "node:sqlite";

import { SecretCipher } from "@living-network/ai";

import {
  applyV2Migrations,
  openV2SqliteConnection,
  V2SqliteAssetGenerationRepository,
  V2SqliteCanonSnapshotReader,
  V2SqliteGenerationJobRepository,
  V2SqlitePlatformRepository,
} from "@living-network/database/v2";
import type { V2CapabilitiesResponse } from "@living-network/contracts/v2";

import { createV2GenerationPlugin } from "../generation/index.ts";
import { createV2FastifyApp } from "./app.ts";
import { createV2PlatformPlugin, getV2PlatformCapabilities } from "./plugin.ts";

export interface V2ApiRuntime {
  readonly app: ReturnType<typeof createV2FastifyApp>;
  readonly db: DatabaseSync;
  close(): Promise<void>;
}

export function createV2ApiRuntime(options: {
  readonly sqlitePath: string;
  readonly mediaRoot?: string;
  readonly capabilities?: V2CapabilitiesResponse;
  readonly integrationSecretKey?: string;
  readonly environmentSceneConfigured?: boolean;
  readonly environmentAssetConfigured?: boolean;
}): V2ApiRuntime {
  const db = openV2SqliteConnection({ path: options.sqlitePath });
  applyV2Migrations(db);
  const platformRepository = new V2SqlitePlatformRepository(db);
  const secretCipher = options.integrationSecretKey === undefined ? undefined : new SecretCipher(options.integrationSecretKey);
  const platformDependencies = {
    repository: platformRepository,
    ...(secretCipher === undefined ? {} : { secretCipher }),
    sceneGenerationEnabled: options.capabilities?.sceneGeneration.enabled ?? false,
    assetGenerationEnabled: options.capabilities?.assetGeneration.enabled ?? false,
    environmentSceneConfigured: options.environmentSceneConfigured ?? false,
    environmentAssetConfigured: options.environmentAssetConfigured ?? false,
  };
  const jobs = new V2SqliteGenerationJobRepository(db);
  const assets = new V2SqliteAssetGenerationRepository(db);
  const app = createV2FastifyApp({
    coreOptions: { sqlite: db },
    ...(options.mediaRoot === undefined ? {} : { mediaRoot: options.mediaRoot }),
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    capabilitiesProvider: () => getV2PlatformCapabilities(platformDependencies),
    platformPlugin: createV2PlatformPlugin(platformDependencies),
    ready: () => {
      db.prepare("SELECT 1").get();
      return true;
    },
    generationPlugin: createV2GenerationPlugin({
      canonSnapshots: new V2SqliteCanonSnapshotReader(db),
      jobs,
      assetJobs: assets,
      assetCandidates: assets,
      assetReviews: assets,
      capabilities: {
        sceneGenerationEnabled: options.capabilities?.sceneGeneration.enabled ?? false,
        assetGenerationEnabled: options.capabilities?.assetGeneration.enabled ?? false,
      },
      capabilitiesProvider: () => getV2PlatformCapabilities(platformDependencies),
    }),
  });
  return {
    app,
    db,
    async close() {
      await app.close();
      db.close();
    },
  };
}
