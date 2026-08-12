import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/0022_story_generation.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../migrations/0022_story_generation.down.sql", import.meta.url),
  "utf8",
);

test("story generation migration creates jobs table with status check", () => {
  assert.match(migration, /CREATE TABLE story_generation_jobs/);
  assert.match(migration, /id TEXT PRIMARY KEY/);
  assert.match(migration, /story_node_id TEXT NOT NULL/);
  assert.match(migration, /story_world_id TEXT NOT NULL/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'PENDING'/);
  assert.match(migration, /CHECK \(status IN \('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'\)\)/);
  assert.match(migration, /attempt INTEGER NOT NULL DEFAULT 1/);
  assert.match(migration, /idempotency_key TEXT NOT NULL/);
  assert.match(migration, /provider TEXT/);
  assert.match(migration, /model TEXT/);
  assert.match(migration, /failure_reason TEXT/);
  assert.match(migration, /created_at TIMESTAMPTZ NOT NULL/);
  assert.match(migration, /started_at TIMESTAMPTZ/);
  assert.match(migration, /finished_at TIMESTAMPTZ/);
});

test("story generation migration enforces idempotency per world", () => {
  assert.match(migration, /UNIQUE\(story_world_id, idempotency_key\)/);
});

test("story generation migration cascades on node and world deletion", () => {
  const nodeFk = migration.match(/story_node_id TEXT NOT NULL REFERENCES \w+\(id\) ON DELETE CASCADE/);
  assert.ok(nodeFk, "story_node_id must cascade on delete");
  const worldFk = migration.match(/story_world_id TEXT NOT NULL REFERENCES \w+\(id\) ON DELETE CASCADE/g);
  assert.ok(worldFk && worldFk.length >= 2, "both tables must cascade on world delete");
});

test("story generation migration creates candidates table with status check", () => {
  assert.match(migration, /CREATE TABLE story_generation_candidates/);
  assert.match(migration, /source_job_id TEXT NOT NULL/);
  assert.match(migration, /body TEXT NOT NULL/);
  assert.match(migration, /choices JSONB NOT NULL/);
  assert.match(migration, /prompt_version TEXT NOT NULL/);
  assert.match(migration, /CHECK \(status IN \('PENDING_REVIEW', 'APPROVED', 'REJECTED'\)\)/);
  assert.match(migration, /reviewed_at TIMESTAMPTZ/);
  assert.match(migration, /reviewer_character_id TEXT/);
});

test("story generation migration candidates cascade on job deletion", () => {
  assert.match(migration, /source_job_id TEXT NOT NULL REFERENCES story_generation_jobs\(id\) ON DELETE CASCADE/);
});

test("story generation migration adds query indexes", () => {
  assert.match(migration, /idx_story_generation_jobs_node/);
  assert.match(migration, /idx_story_generation_jobs_status/);
  assert.match(migration, /idx_story_generation_candidates_node/);
  assert.match(migration, /idx_story_generation_candidates_status/);
});

test("story generation migration has dependency-safe rollback", () => {
  // Candidates must be dropped before jobs due to FK
  const candidateDrop = rollback.indexOf("DROP TABLE IF EXISTS story_generation_candidates");
  const jobDrop = rollback.indexOf("DROP TABLE IF EXISTS story_generation_jobs");
  assert.ok(candidateDrop >= 0, "must drop candidates");
  assert.ok(jobDrop >= 0, "must drop jobs");
  assert.ok(candidateDrop < jobDrop, "candidates must be dropped before jobs");
});
