import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function read(name: string): string {
  return readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
}

test("visual workflow migration persists identity layers and versioned templates", () => {
  const sql = read("0008_visual_workflows.sql");
  assert.match(sql, /CREATE TABLE character_visual_identities/);
  assert.match(sql, /positive_prompt text NOT NULL/);
  assert.match(sql, /style_tags text\[\] NOT NULL/);
  assert.match(sql, /UNIQUE \(character_id\)/);
  assert.match(sql, /REFERENCES characters\(id, story_world_id\)/);
  assert.match(sql, /CREATE TABLE image_workflow_templates/);
  assert.match(sql, /workflow jsonb NOT NULL CHECK \(jsonb_typeof\(workflow\) = 'object'\)/);
  assert.match(sql, /PRIMARY KEY \(id, version\)/);
});

test("visual workflow migration has dependency-safe rollback", () => {
  const sql = read("0008_visual_workflows.down.sql");
  assert.ok(sql.indexOf("image_workflow_templates") < sql.indexOf("character_visual_identities"));
  assert.match(sql, /DROP TABLE IF EXISTS character_visual_identities/);
});
