import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/0012_integrations.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("../migrations/0012_integrations.down.sql", import.meta.url), "utf8");

test("integration migration creates constrained LLM profiles and singleton settings", () => {
  assert.match(migration, /CREATE TABLE llm_provider_profiles/);
  assert.match(migration, /protocol IN \('OPENAI_COMPATIBLE', 'ANTHROPIC'\)/);
  assert.match(migration, /llm_provider_profiles_key_parts CHECK/);
  assert.match(migration, /CREATE UNIQUE INDEX llm_provider_profiles_one_active/);
  assert.match(migration, /ON llm_provider_profiles \(\(is_active\)\) WHERE is_active/);
  assert.match(migration, /CREATE TABLE integration_settings/);
  assert.match(migration, /PRIMARY KEY CHECK \(id = 'default'\)/);
});

test("integration migration rollback removes settings before provider profiles", () => {
  assert.match(rollback, /DROP TABLE IF EXISTS integration_settings/);
  assert.match(rollback, /DROP TABLE IF EXISTS llm_provider_profiles/);
  assert.ok(rollback.indexOf("integration_settings") < rollback.indexOf("llm_provider_profiles"));
});
