import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/0014_world_lore.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("../migrations/0014_world_lore.down.sql", import.meta.url), "utf8");

test("world lore migration stores categorized entries with enabled full-text search", () => {
  assert.match(migration, /CREATE TABLE world_lore_entries/);
  assert.match(migration, /story_world_id text NOT NULL REFERENCES story_worlds/);
  assert.match(migration, /category text NOT NULL/);
  assert.match(migration, /tags text\[\] NOT NULL DEFAULT '\{\}'/);
  assert.match(migration, /world_lore_entries_world_enabled_idx/);
  assert.match(migration, /world_lore_entries_search_idx/);
  assert.match(migration, /USING gin \(to_tsvector\('simple'/);
  assert.match(rollback, /DROP TABLE world_lore_entries/);
});
