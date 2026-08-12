import type { DatabaseSync } from "node:sqlite";

import {
  applyV2Migrations,
  openV2SqliteConnection,
  V2SqliteAssetGenerationRepository,
  V2SqliteCanonSnapshotReader,
  V2SqliteGenerationJobRepository,
} from "@living-network/database";

import { createV2GenerationPlugin } from "../generation/index.ts";
import { createV2FastifyApp } from "./app.ts";

export interface V2ApiRuntime {
  readonly app: ReturnType<typeof createV2FastifyApp>;
  readonly db: DatabaseSync;
  close(): Promise<void>;
}

export function createV2ApiRuntime(options: { readonly sqlitePath: string }): V2ApiRuntime {
  const db = openV2SqliteConnection({ path: options.sqlitePath });
  applyV2Migrations(db);
  const jobs = new V2SqliteGenerationJobRepository(db);
  const assets = new V2SqliteAssetGenerationRepository(db);
  const app = createV2FastifyApp({
    coreOptions: { sqlite: db },
    generationPlugin: createV2GenerationPlugin({
      canonSnapshots: new V2SqliteCanonSnapshotReader(db),
      jobs,
      assetJobs: assets,
      assetCandidates: assets,
      assetReviews: assets,
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
