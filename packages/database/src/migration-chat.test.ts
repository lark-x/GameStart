import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../migrations/0002_chat.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../migrations/0002_chat.down.sql", import.meta.url),
  "utf8",
);

test("chat migration creates conversations, members, and messages", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /CREATE TABLE conversations/);
  assert.match(migration, /CREATE TABLE conversation_members/);
  assert.match(migration, /CREATE TABLE messages/);
  assert.match(migration, /conversation_members_conversation_world_fk/);
  assert.match(migration, /conversation_members_character_world_fk/);
  assert.match(migration, /messages_conversation_idempotency_unique/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("chat migration protects cardinality, payload kinds, and active authors", () => {
  assert.match(migration, /conversation_member_count_trigger/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /PRIVATE conversation must have exactly two members/);
  assert.match(migration, /GROUP conversation must have at least two members/);
  assert.match(migration, /messages_payload_matches_kind/);
  assert.match(migration, /messages_active_author_trigger/);
  assert.match(migration, /message author must be an active conversation member/);
});

test("chat migration adds message indexes and dependency-safe rollback", () => {
  assert.match(migration, /conversation_members_character_idx/);
  assert.match(migration, /messages_conversation_created_idx/);
  assert.match(rollback, /DROP TABLE IF EXISTS messages/);
  assert.match(rollback, /DROP TABLE IF EXISTS conversation_members/);
  assert.match(rollback, /DROP TABLE IF EXISTS conversations/);
  assert.match(rollback, /COMMIT;\s*$/);
});
