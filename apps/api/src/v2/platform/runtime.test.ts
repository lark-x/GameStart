import assert from "node:assert/strict";
import test from "node:test";

import { openV2TempSqliteConnection } from "@living-network/database";

import { createV2ApiRuntime } from "./runtime.ts";

test("V2 API runtime applies core and generation migrations and wires both plugins", async () => {
  const temp = openV2TempSqliteConnection();
  const path = temp.path;
  temp.db.close();
  const runtime = createV2ApiRuntime({ sqlitePath: path });
  try {
    const migrations = runtime.db.prepare("SELECT id FROM v2_schema_migrations ORDER BY id").all() as Array<{ id: string }>;
    assert.deepEqual(migrations.map((migration) => migration.id), [
      "0001_v2_core_canon",
      "0002_v2_core_graph_state",
      "0003_v2_core_candidate_review",
      "0004_v2_core_release_runtime",
      "0100_generation_jobs",
      "0101_asset_generation_jobs",
      "0102_asset_candidate_review",
    ]);
    const health = await runtime.app.inject({ method: "GET", url: "/api/v2/health" });
    assert.equal(health.statusCode, 200);
    const world = await runtime.app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: { storyWorldId: "world_runtime", name: "Runtime", idempotencyKey: "world_runtime" },
    });
    assert.equal(world.statusCode, 201);
    const context = await runtime.app.inject({
      method: "POST",
      url: "/api/v2/generation/context-preview",
      payload: { storyWorldId: "world_runtime", baseCanonRevision: 1, prompt: "Create a scene" },
    });
    assert.equal(context.statusCode, 200);
    assert.equal(context.json().context.baseCanonRevision, 1);
  } finally {
    await runtime.close();
    temp.cleanup();
  }
});
