import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/0007_social_feed.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../migrations/0007_social_feed.down.sql", import.meta.url),
  "utf8",
);

test("social feed migration creates moments and interactions with idempotency", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /CREATE TABLE moments/);
  assert.match(migration, /CREATE TABLE moment_interactions/);
  assert.match(migration, /moments_feed_idx/);
  assert.match(migration, /moment_interactions_idempotency_unique/);
  assert.match(migration, /moment_interactions_like_unique/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("social feed migration protects visibility, audience, payload, and world links", () => {
  assert.match(migration, /enforce_moment_audience/);
  assert.match(migration, /PRIVATE moment audience must include its author/);
  assert.match(migration, /RELATION\/GROUP moment requires an audience/);
  assert.match(migration, /moment audience character must belong to the story world/);
  assert.match(migration, /moment_interactions_payload_check/);
  assert.match(migration, /enforce_moment_interaction_links/);
  assert.match(migration, /moment interaction must match moment story world/);
});

test("social feed migration has dependency-safe rollback", () => {
  assert.match(rollback, /DROP TABLE IF EXISTS moment_interactions/);
  assert.match(rollback, /DROP TABLE IF EXISTS moments/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS enforce_moment_audience/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS enforce_moment_interaction_links/);
  assert.match(rollback, /COMMIT;\s*$/);
});
