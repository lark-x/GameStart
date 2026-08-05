import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/0006_behavior_media.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../migrations/0006_behavior_media.down.sql", import.meta.url),
  "utf8",
);

test("behavior/media migration creates actions, moment drafts, and image jobs", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /CREATE TABLE behavior_actions/);
  assert.match(migration, /CREATE TABLE moment_drafts/);
  assert.match(migration, /CREATE TABLE image_jobs/);
  assert.match(migration, /behavior_actions_execution_priority_idx/);
  assert.match(migration, /moment_drafts_action_unique/);
  assert.match(migration, /image_jobs_action_unique/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("behavior/media migration protects payload shape, lifecycle, and cross-aggregate links", () => {
  assert.match(migration, /jsonb_typeof\(payload\) = 'object'/);
  assert.match(migration, /image_jobs_status_shape/);
  assert.match(migration, /attempt integer NOT NULL DEFAULT 1/);
  assert.match(migration, /enforce_behavior_media_links/);
  assert.match(migration, /behavior action actor must be an execution target/);
  assert.match(migration, /moment draft must match a CREATE_MOMENT action/);
  assert.match(migration, /image job must match an image-capable behavior action/);
  assert.match(migration, /image job moment draft must match its behavior action/);
  assert.match(migration, /moment_drafts_image_job_fk/);
  assert.match(migration, /behavior_actions_links_trigger/);
  assert.match(migration, /moment_drafts_links_trigger/);
  assert.match(migration, /image_jobs_links_trigger/);
});

test("behavior/media migration indexes queue work and rolls back in dependency order", () => {
  assert.match(migration, /image_jobs_queue_idx/);
  assert.match(rollback, /DROP TABLE IF EXISTS image_jobs/);
  assert.match(rollback, /DROP TABLE IF EXISTS moment_drafts/);
  assert.match(rollback, /DROP TABLE IF EXISTS behavior_actions/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS enforce_behavior_media_links/);
  assert.match(rollback, /COMMIT;\s*$/);
});
