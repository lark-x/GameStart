import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/0009_stickers.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("../migrations/0009_stickers.down.sql", import.meta.url), "utf8");

test("sticker migration stores packs, tags, media refs, and world links", () => {
  assert.match(migration, /CREATE TABLE sticker_packs/);
  assert.match(migration, /source_ref text/);
  assert.match(migration, /CREATE TABLE stickers/);
  assert.match(migration, /tags text\[\] NOT NULL/);
  assert.match(migration, /media_ref text NOT NULL/);
  assert.match(migration, /FOREIGN KEY \(pack_id, story_world_id\)/);
  assert.match(migration, /REFERENCES sticker_packs\(id, story_world_id\)/);
});

test("sticker migration rolls back child rows before packs", () => {
  assert.ok(rollback.indexOf("DROP TABLE IF EXISTS stickers") < rollback.indexOf("DROP TABLE IF EXISTS sticker_packs"));
});
