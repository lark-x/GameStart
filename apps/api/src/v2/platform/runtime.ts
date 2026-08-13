import type { DatabaseSync } from "node:sqlite";

import {
  applyV2Migrations,
  openV2SqliteConnection,
  V2SqliteAssetGenerationRepository,
  V2SqliteCanonSnapshotReader,
  V2SqliteGenerationJobRepository,
} from "@living-network/database/v2";
import type { V2CapabilitiesResponse } from "@living-network/contracts/v2";

import { createV2GenerationPlugin } from "../generation/index.ts";
import { createV2FastifyApp } from "./app.ts";

export interface V2ApiRuntime {
  readonly app: ReturnType<typeof createV2FastifyApp>;
  readonly db: DatabaseSync;
  close(): Promise<void>;
}

export function createV2ApiRuntime(options: {
  readonly sqlitePath: string;
  readonly mediaRoot?: string;
  readonly capabilities?: V2CapabilitiesResponse;
}): V2ApiRuntime {
  const db = openV2SqliteConnection({ path: options.sqlitePath });
  applyV2Migrations(db);
  const jobs = new V2SqliteGenerationJobRepository(db);
  const assets = new V2SqliteAssetGenerationRepository(db);
  const app = createV2FastifyApp({
    coreOptions: { sqlite: db },
    ...(options.mediaRoot === undefined ? {} : { mediaRoot: options.mediaRoot }),
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
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
