import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/0020_story_graph.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../migrations/0020_story_graph.down.sql", import.meta.url),
  "utf8",
);

test("story graph migration creates arcs, nodes, edges, prompt templates, and memory candidates", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /CREATE TABLE story_arcs/);
  assert.match(migration, /CREATE TABLE story_nodes/);
  assert.match(migration, /CREATE TABLE story_edges/);
  assert.match(migration, /CREATE TABLE prompt_templates/);
  assert.match(migration, /CREATE TABLE memory_candidates/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("story graph migration protects world ownership and cross-references", () => {
  assert.match(migration, /story_arcs_world_id_unique/);
  assert.match(migration, /story_nodes_world_arc_unique/);
  assert.match(migration, /story_nodes_arc_world_fk/);
  assert.match(migration, /story_edges_no_self_loop/);
  assert.match(migration, /story_edges_arc_world_fk/);
  assert.match(migration, /story_edges_from_world_fk/);
  assert.match(migration, /story_edges_to_world_fk/);
  assert.match(migration, /memory_candidates_reviewer_fk/);
  assert.match(migration, /memory_candidates_merged_memory_fk/);
});

test("story graph migration adds query indexes", () => {
  assert.match(migration, /story_arcs_world_status_idx/);
  assert.match(migration, /story_nodes_arc_order_idx/);
  assert.match(migration, /story_nodes_world_idx/);
  assert.match(migration, /story_nodes_involved_characters_idx/);
  assert.match(migration, /story_nodes_referenced_memories_idx/);
  assert.match(migration, /story_edges_arc_idx/);
  assert.match(migration, /story_edges_from_node_idx/);
  assert.match(migration, /story_edges_to_node_idx/);
  assert.match(migration, /prompt_templates_world_type_idx/);
  assert.match(migration, /memory_candidates_world_status_idx/);
});

test("story graph migration has dependency-safe rollback", () => {
  assert.match(rollback, /DROP TABLE IF EXISTS memory_candidates/);
  assert.match(rollback, /DROP TABLE IF EXISTS prompt_templates/);
  assert.match(rollback, /DROP TABLE IF EXISTS story_edges/);
  assert.match(rollback, /DROP TABLE IF EXISTS story_nodes/);
  assert.match(rollback, /DROP TABLE IF EXISTS story_arcs/);
  assert.match(rollback, /COMMIT;\s*$/);
});
