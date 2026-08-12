import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/0021_world_context_policy.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../migrations/0021_world_context_policy.down.sql", import.meta.url),
  "utf8",
);

test("world context policy migration creates the table with required columns", () => {
  assert.match(migration, /CREATE TABLE world_context_policies/);
  assert.match(migration, /id TEXT PRIMARY KEY/);
  assert.match(migration, /story_world_id TEXT NOT NULL/);
  assert.match(migration, /world_lore_enabled BOOLEAN NOT NULL/);
  assert.match(migration, /relationships_enabled BOOLEAN NOT NULL/);
  assert.match(migration, /schedules_enabled BOOLEAN NOT NULL/);
  assert.match(migration, /memories_enabled BOOLEAN NOT NULL/);
  assert.match(migration, /created_at TIMESTAMPTZ NOT NULL/);
  assert.match(migration, /updated_at TIMESTAMPTZ NOT NULL/);
});

test("world context policy migration enforces one policy per world", () => {
  assert.match(migration, /UNIQUE\(story_world_id\)/);
});

test("world context policy migration cascades on world deletion", () => {
  assert.match(migration, /REFERENCES story_worlds\(id\) ON DELETE CASCADE/);
});

test("world context policy migration adds query index", () => {
  assert.match(migration, /idx_world_context_policies_world/);
});

test("world context policy migration has safe rollback", () => {
  assert.match(rollback, /DROP TABLE IF EXISTS world_context_policies/);
});
