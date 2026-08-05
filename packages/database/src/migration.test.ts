import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/0001_initial.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../migrations/0001_initial.down.sql", import.meta.url),
  "utf8",
);

test("initial migration creates the domain tables and explicit transaction", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /CREATE TABLE story_worlds/);
  assert.match(migration, /CREATE TABLE characters/);
  assert.match(migration, /CREATE TABLE relationship_edges/);
  assert.match(migration, /CREATE TABLE actor_sessions/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("initial migration preserves domain invariants in SQL", () => {
  assert.match(migration, /story_mode IN \('STATIC', 'DYNAMIC'\)/);
  assert.match(migration, /story_worlds_dynamics_match_mode/);
  assert.match(migration, /role IN \('AI', 'USER'\)/);
  assert.match(migration, /relationship_edges_no_self_loop/);
  assert.match(migration, /relationship_edges_source_world_fk/);
  assert.match(migration, /relationship_edges_target_world_fk/);
  assert.match(migration, /affinity double precision NOT NULL CHECK \(affinity BETWEEN -100 AND 100\)/);
  assert.match(migration, /trust double precision NOT NULL CHECK \(trust BETWEEN -100 AND 100\)/);
  assert.match(migration, /conflict double precision NOT NULL CHECK \(conflict BETWEEN -100 AND 100\)/);
  assert.match(migration, /dependency double precision NOT NULL CHECK \(dependency BETWEEN -100 AND 100\)/);
  assert.match(migration, /actor_sessions_user_character_role_trigger/);
  assert.match(migration, /actor session user character must have role USER/);
});

test("initial migration adds query indexes and has a destructive rollback companion", () => {
  assert.match(migration, /characters_story_world_idx/);
  assert.match(migration, /relationship_edges_story_world_idx/);
  assert.match(migration, /actor_sessions_story_world_idx/);
  assert.match(migration, /actor_sessions_user_character_idx/);
  assert.match(rollback, /^BEGIN;/);
  assert.match(rollback, /DROP TABLE IF EXISTS actor_sessions/);
  assert.match(rollback, /DROP TABLE IF EXISTS relationship_edges/);
  assert.match(rollback, /DROP TABLE IF EXISTS characters/);
  assert.match(rollback, /DROP TABLE IF EXISTS story_worlds/);
  assert.match(rollback, /COMMIT;\s*$/);
});
