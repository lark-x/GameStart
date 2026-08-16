import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  openV2TempSqliteConnection,
} from "@living-network/database/v2";

import { startV2Worker } from "./runtime.ts";

test("V2 worker starts without Redis when external generation lanes are disabled", async () => {
  const { db, cleanup, path } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    db.close();
    const worker = await startV2Worker({
      V2_SQLITE_PATH: path,
      V2_MEDIA_ROOT: path.replace(/\.sqlite$/, "-media"),
      V2_SCENE_GENERATION_ENABLED: "false",
      V2_ASSET_GENERATION_ENABLED: "false",
      V2_DISPATCH_TICK_MS: "10000",
    });
    await worker.stop();
  } finally {
    cleanup();
  }
});

test("V2 worker refuses to start before API migrations have run", async () => {
  const { db, cleanup, path } = openV2TempSqliteConnection();
  try {
    db.close();
    await assert.rejects(
      () => startV2Worker({
        V2_SQLITE_PATH: path,
        V2_MEDIA_ROOT: path.replace(/\.sqlite$/, "-media"),
        V2_SCENE_GENERATION_ENABLED: "false",
        V2_ASSET_GENERATION_ENABLED: "false",
      }),
      /API must migrate first/,
    );
  } finally {
    cleanup();
  }
});
