import assert from "node:assert/strict";
import test from "node:test";

import { applyV2Migrations, getV2Migrations, listV2Migrations, openV2TempSqliteConnection } from "@living-network/database/v2";

import { createV2ApiRuntime } from "./runtime.ts";

test("V2 API runtime applies core and generation migrations and wires both plugins", async () => {
  const temp = openV2TempSqliteConnection();
  const path = temp.path;
  temp.db.close();
  const runtime = createV2ApiRuntime({ sqlitePath: path });
  try {
    const migrations = runtime.db.prepare("SELECT id FROM v2_schema_migrations ORDER BY id").all() as Array<{ id: string }>;
    const expected = listV2Migrations().map((migration) => migration.id).sort();
    assert.deepEqual(migrations.map((migration) => migration.id), expected);
    const health = await runtime.app.inject({ method: "GET", url: "/api/v2/health" });
    assert.equal(health.statusCode, 200);
    const ready = await runtime.app.inject({ method: "GET", url: "/api/v2/ready" });
    assert.equal(ready.statusCode, 200);
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

test("V2 API runtime upgrades an old database in place and preserves legacy profiles", async () => {
  const temp = openV2TempSqliteConnection();
  const path = temp.path;
  // Build an "old" schema: everything except the newest migrations.
  const exclude = new Set(["0203_v2_model_profile_context_modalities", "0340_v2_chat_maintenance_cursors", "0350_v2_chat_traces"]);
  const legacyMigrations = getV2Migrations().filter((migration) => !exclude.has(migration.id));
  applyV2Migrations(temp.db, legacyMigrations);
  temp.db.prepare(`
    INSERT INTO v2_model_profiles (
      profile_id, name, protocol, base_url, model, timeout_ms, max_tokens,
      temperature, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "profile:legacy-runtime",
    "Legacy Runtime",
    "anthropic",
    "https://api.anthropic.com",
    "claude-legacy",
    30000,
    4096,
    0.7,
    "2026-08-01T00:00:00.000Z",
    "2026-08-01T00:00:00.000Z",
  );
  temp.db.close();

  const runtime = createV2ApiRuntime({ sqlitePath: path });
  try {
    const migrations = runtime.db.prepare("SELECT id FROM v2_schema_migrations ORDER BY id").all() as Array<{ id: string }>;
    assert.deepEqual(migrations.map((migration) => migration.id), listV2Migrations().map((migration) => migration.id).sort());

    const profiles = await runtime.app.inject({
      method: "GET",
      url: "/api/v2/platform/model-profiles",
    });
    assert.equal(profiles.statusCode, 200);
    const legacy = (profiles.json() as { readonly profiles: readonly { readonly id: string; readonly name: string }[] }).profiles
      .find((profile) => profile.id === "profile:legacy-runtime");
    assert.ok(legacy, "Legacy profile must be readable after upgrade");
    assert.equal(legacy.name, "Legacy Runtime");

    const updated = await runtime.app.inject({
      method: "PUT",
      url: "/api/v2/platform/model-profiles/profile%3Alegacy-runtime",
      payload: {
        name: "Legacy Runtime Updated",
        protocol: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "claude-legacy",
        maxTokens: 4096,
        contextWindow: 8192,
        inputModalities: ["text"],
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().profile.contextWindow, 8192);
  } finally {
    await runtime.close();
    temp.cleanup();
  }
});
