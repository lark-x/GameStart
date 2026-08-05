import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/0004_events.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../migrations/0004_events.down.sql", import.meta.url),
  "utf8",
);

test("event migration creates definitions and idempotent scheduled occurrences", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /CREATE TABLE world_event_definitions/);
  assert.match(migration, /world_event_definitions_key_unique/);
  assert.match(migration, /CREATE TABLE scheduled_occurrences/);
  assert.match(migration, /scheduled_occurrences_key_unique/);
  assert.match(migration, /scheduled_occurrences_definition_world_fk/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("event migration protects recurrence shapes and target character ownership", () => {
  assert.match(migration, /world_event_definitions_recurrence_shape/);
  assert.match(migration, /recurrence_kind = 'ONCE'/);
  assert.match(migration, /recurrence_kind = 'ANNUAL'/);
  assert.match(migration, /enforce_event_definition_targets/);
  assert.match(migration, /event target characters cannot contain duplicates/);
  assert.match(migration, /event target character must belong to the story world/);
  assert.match(migration, /world_event_definitions_targets_trigger/);
});

test("event migration indexes enabled definitions and due occurrences and rolls back safely", () => {
  assert.match(migration, /world_event_definitions_world_enabled_idx/);
  assert.match(migration, /scheduled_occurrences_due_idx/);
  assert.match(rollback, /DROP TABLE IF EXISTS scheduled_occurrences/);
  assert.match(rollback, /DROP TRIGGER IF EXISTS world_event_definitions_targets_trigger/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS enforce_event_definition_targets/);
  assert.match(rollback, /DROP TABLE IF EXISTS world_event_definitions/);
  assert.match(rollback, /COMMIT;\s*$/);
});
