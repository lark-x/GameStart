import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  getV2Migrations,
  openV2TempSqliteConnection,
  revertV2Migrations,
  V2SqlitePlatformRepository,
} from "../index.ts";

const CONTEXT_MODALITIES_MIGRATION_ID = "0203_v2_model_profile_context_modalities";

test("V2 platform fresh DB gets context_window and input_modalities_json columns", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const columns = db.prepare("PRAGMA table_info(v2_model_profiles)").all() as unknown as readonly {
      name: string;
    }[];
    const names = new Set(columns.map((column) => column.name));
    assert.ok(names.has("context_window"));
    assert.ok(names.has("input_modalities_json"));

    const repository = new V2SqlitePlatformRepository(db);
    const profile = await repository.saveModelProfile({
      id: "profile:writer",
      name: "Writer",
      protocol: "openai-compatible",
      baseUrl: "http://localhost:4000/v1",
      model: "writer-model",
      timeoutMs: 12000,
      maxTokens: 2048,
      contextWindow: 8192,
      inputModalities: ["text", "image"],
      temperature: 0.4,
      encryptedApiKey: "ciphertext",
      encryptionIv: "iv",
      createdAt: "2026-08-14T10:00:00.000Z",
      updatedAt: "2026-08-14T10:00:00.000Z",
    });
    assert.equal(profile.contextWindow, 8192);
    assert.deepEqual(profile.inputModalities, ["text", "image"]);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 platform old DB upgrades in place and preserves profiles and bindings", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    const oldMigrations = getV2Migrations().filter((migration) => migration.id !== CONTEXT_MODALITIES_MIGRATION_ID);
    applyV2Migrations(db, oldMigrations);

    const before = db.prepare("PRAGMA table_info(v2_model_profiles)").all() as unknown as readonly {
      name: string;
    }[];
    const beforeNames = new Set(before.map((column) => column.name));
    assert.ok(!beforeNames.has("context_window"));
    assert.ok(!beforeNames.has("input_modalities_json"));

    db.prepare(`
      INSERT INTO v2_model_profiles (
        profile_id, name, protocol, base_url, model, timeout_ms, max_tokens,
        temperature, encrypted_api_key, encryption_iv, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "profile:legacy",
      "Legacy",
      "anthropic",
      "https://api.anthropic.com",
      "claude-legacy",
      30000,
      4096,
      0.7,
      "ciphertext",
      "iv",
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    );
    db.prepare(`
      INSERT INTO v2_model_bindings (capability, profile_id, updated_at)
      VALUES (?, ?, ?)
    `).run("chat", "profile:legacy", "2026-08-01T00:00:00.000Z");

    applyV2Migrations(db);

    const after = db.prepare("PRAGMA table_info(v2_model_profiles)").all() as unknown as readonly {
      name: string;
    }[];
    const afterNames = new Set(after.map((column) => column.name));
    assert.ok(afterNames.has("context_window"));
    assert.ok(afterNames.has("input_modalities_json"));

    const repository = new V2SqlitePlatformRepository(db);
    const legacy = await repository.getModelProfile("profile:legacy");
    assert.ok(legacy);
    assert.equal(legacy.name, "Legacy");
    assert.equal(legacy.contextWindow, undefined);
    assert.equal(legacy.inputModalities, undefined);
    const binding = await repository.getModelBinding("chat");
    assert.equal(binding?.profileId, "profile:legacy");

    const updated = await repository.saveModelProfile({
      ...legacy,
      contextWindow: 200000,
      inputModalities: ["text", "image"],
      updatedAt: "2026-08-18T00:00:00.000Z",
    });
    assert.equal(updated.contextWindow, 200000);
    assert.deepEqual(updated.inputModalities, ["text", "image"]);
    assert.equal(updated.encryptedApiKey, "ciphertext");
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 platform 0203 down migration drops context columns without losing data", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqlitePlatformRepository(db);
    const profile = await repository.saveModelProfile({
      id: "profile:writer",
      name: "Writer",
      protocol: "openai-compatible",
      baseUrl: "http://localhost:4000/v1",
      model: "writer-model",
      timeoutMs: 12000,
      maxTokens: 2048,
      contextWindow: 8192,
      inputModalities: ["text", "image"],
      temperature: 0.4,
      createdAt: "2026-08-14T10:00:00.000Z",
      updatedAt: "2026-08-14T10:00:00.000Z",
    });
    assert.equal(profile.contextWindow, 8192);

    const onlyContextMigration = getV2Migrations().filter((migration) => migration.id === CONTEXT_MODALITIES_MIGRATION_ID);
    revertV2Migrations(db, onlyContextMigration);

    const columns = db.prepare("PRAGMA table_info(v2_model_profiles)").all() as unknown as readonly {
      name: string;
    }[];
    const names = new Set(columns.map((column) => column.name));
    assert.ok(!names.has("context_window"));
    assert.ok(!names.has("input_modalities_json"));

    const row = db.prepare("SELECT * FROM v2_model_profiles WHERE profile_id = ?").get("profile:writer") as
      | { name: string; model: string; max_tokens: number }
      | undefined;
    assert.ok(row);
    assert.equal(row.name, "Writer");
    assert.equal(row.model, "writer-model");
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 platform transitional DB (columns exist without 0203 record) upgrades without duplicate columns", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    const oldMigrations = getV2Migrations().filter((migration) => migration.id !== CONTEXT_MODALITIES_MIGRATION_ID);
    applyV2Migrations(db, oldMigrations);

    // Simulate PR #32 transitional state: columns were added directly to 0200,
    // so they exist even though 0203 was never registered.
    db.exec(`
      ALTER TABLE v2_model_profiles ADD COLUMN context_window INTEGER;
      ALTER TABLE v2_model_profiles ADD COLUMN input_modalities_json TEXT;
    `);
    db.prepare(`
      INSERT INTO v2_model_profiles (
        profile_id, name, protocol, base_url, model, timeout_ms, max_tokens,
        temperature, created_at, updated_at, context_window, input_modalities_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "profile:transitional",
      "Transitional",
      "openai-compatible",
      "http://localhost:4000/v1",
      "transitional-model",
      30000,
      4096,
      0.2,
      "2026-08-15T00:00:00.000Z",
      "2026-08-15T00:00:00.000Z",
      8192,
      JSON.stringify(["text"]),
    );

    applyV2Migrations(db);

    const columns = db.prepare("PRAGMA table_info(v2_model_profiles)").all() as unknown as readonly {
      name: string;
    }[];
    const names = new Set(columns.map((column) => column.name));
    assert.ok(names.has("context_window"));
    assert.ok(names.has("input_modalities_json"));

    const repository = new V2SqlitePlatformRepository(db);
    const profile = await repository.getModelProfile("profile:transitional");
    assert.ok(profile);
    assert.equal(profile.contextWindow, 8192);
    assert.deepEqual(profile.inputModalities, ["text"]);

    const updated = await repository.saveModelProfile({
      ...profile,
      contextWindow: 128000,
      inputModalities: ["text", "image"],
      updatedAt: "2026-08-18T00:00:00.000Z",
    });
    assert.equal(updated.contextWindow, 128000);
    assert.deepEqual(updated.inputModalities, ["text", "image"]);
  } finally {
    db.close();
    cleanup();
  }
});
