import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/0011_appearance.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("../migrations/0011_appearance.down.sql", import.meta.url), "utf8");

test("appearance migration stores per-owner theme and chat background", () => {
  assert.match(migration, /CREATE TABLE appearance_settings/);
  assert.match(migration, /owner_key text NOT NULL/);
  assert.match(migration, /theme_id text NOT NULL/);
  assert.match(migration, /chat_background_kind text NOT NULL CHECK \(chat_background_kind IN \('theme', 'custom'\)\)/);
  assert.match(migration, /chat_background_image_ref text/);
  assert.match(migration, /chat_background_opacity double precision NOT NULL/);
  assert.match(migration, /chat_background_blur double precision NOT NULL/);
  assert.match(migration, /UNIQUE \(owner_key\)/);
});

test("appearance migration rolls back the settings table", () => {
  assert.match(rollback, /DROP TABLE IF EXISTS appearance_settings/);
});
