import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/0005_life_simulation.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../migrations/0005_life_simulation.down.sql", import.meta.url),
  "utf8",
);

test("life simulation migration creates plans, executions, and budgets", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /CREATE TABLE character_plans/);
  assert.match(migration, /CREATE TABLE event_executions/);
  assert.match(migration, /CREATE TABLE proactive_message_budgets/);
  assert.match(migration, /event_executions_attempt_unique/);
  assert.match(migration, /proactive_message_budgets_window_unique/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("life simulation migration protects terminal shape and cross-world references", () => {
  assert.match(migration, /character_plans_time_order/);
  assert.match(migration, /event_executions_terminal_shape/);
  assert.match(migration, /jsonb_typeof\(input_snapshot\) = 'object'/);
  assert.match(migration, /enforce_event_execution_links/);
  assert.match(migration, /event execution must match its occurrence and definition/);
  assert.match(migration, /event execution target character must belong to the story world/);
  assert.match(migration, /proactive_message_budgets_character_world_fk/);
});

test("life simulation migration has lookup indexes and a safe rollback", () => {
  assert.match(migration, /character_plans_character_time_idx/);
  assert.match(migration, /event_executions_occurrence_attempt_idx/);
  assert.match(migration, /proactive_message_budgets_active_idx/);
  assert.match(rollback, /DROP TABLE IF EXISTS proactive_message_budgets/);
  assert.match(rollback, /DROP TRIGGER IF EXISTS event_executions_links_trigger/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS enforce_event_execution_links/);
  assert.match(rollback, /DROP TABLE IF EXISTS event_executions/);
  assert.match(rollback, /DROP TABLE IF EXISTS character_plans/);
  assert.match(rollback, /COMMIT;\s*$/);
});
