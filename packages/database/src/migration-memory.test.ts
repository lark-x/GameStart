import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/0003_memory.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../migrations/0003_memory.down.sql", import.meta.url),
  "utf8",
);

test("memory migration creates searchable memory rows with provenance", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /CREATE TABLE memory_items/);
  assert.match(migration, /confidence double precision NOT NULL CHECK \(confidence BETWEEN 0 AND 1\)/);
  assert.match(migration, /audience_character_ids text\[\] NOT NULL/);
  assert.match(migration, /search_vector tsvector GENERATED ALWAYS/);
  assert.match(migration, /CREATE INDEX memory_items_search_vector_idx ON memory_items USING GIN/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("memory migration protects visibility and world audience references", () => {
  assert.match(migration, /memory_visibility_trigger/);
  assert.match(migration, /PRIVATE memory requires a subject character/);
  assert.match(migration, /RELATION\/GROUP memory requires an audience/);
  assert.match(migration, /SYSTEM memory cannot have an audience/);
  assert.match(migration, /memory audience character must belong to the story world/);
  assert.match(migration, /memory_items_subject_world_fk/);
  assert.match(migration, /memory_items_subject_world_fk[\s\S]*ON DELETE CASCADE/);
});

test("memory migration has a rollback companion", () => {
  assert.match(migration, /memory_items_world_created_idx/);
  assert.match(migration, /memory_items_subject_idx/);
  assert.match(rollback, /DROP TRIGGER IF EXISTS memory_visibility_trigger/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS enforce_memory_visibility/);
  assert.match(rollback, /DROP TABLE IF EXISTS memory_items/);
  assert.match(rollback, /COMMIT;\s*$/);
});
