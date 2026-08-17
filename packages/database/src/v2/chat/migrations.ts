import type { DatabaseSync } from "node:sqlite";

import type { V2SqliteMigration } from "../platform/index.ts";

export const v2ChatMemoryMigration: V2SqliteMigration = {
  id: "0300_v2_chat_memory",
  up: (db) => {
    db.exec("ALTER TABLE v2_characters ADD COLUMN persona_text TEXT;");
    db.exec(`
      CREATE TABLE v2_conversations (
        conversation_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        primary_character_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('direct')),
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_message_at TEXT
      );

      CREATE TABLE v2_chat_media (
        media_id TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        media_ref TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
        width INTEGER,
        height INTEGER,
        created_at TEXT NOT NULL
      );

      CREATE TABLE v2_chat_messages (
        message_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES v2_conversations(conversation_id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        character_id TEXT,
        text TEXT,
        attachments_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'interrupted')),
        created_at TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        reply_to_message_id TEXT,
        UNIQUE (conversation_id, idempotency_key)
      );

      CREATE TABLE v2_memories (
        memory_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        conversation_id TEXT,
        character_id TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('profile', 'preference', 'relationship', 'episodic', 'world_fact')),
        content TEXT NOT NULL CHECK (length(trim(content)) > 0),
        importance REAL NOT NULL CHECK (importance >= 0 AND importance <= 1),
        confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        source_message_ids_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK (status IN ('active', 'superseded', 'forgotten')),
        supersedes_memory_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_accessed_at TEXT
      );

      CREATE VIRTUAL TABLE v2_memories_fts USING fts5(
        story_world_id UNINDEXED,
        memory_id UNINDEXED,
        content,
        content='v2_memories',
        content_rowid='rowid'
      );

      CREATE TRIGGER v2_memories_ai AFTER INSERT ON v2_memories BEGIN
        INSERT INTO v2_memories_fts(rowid, story_world_id, memory_id, content)
        VALUES (new.rowid, new.story_world_id, new.memory_id, new.content);
      END;

      CREATE TRIGGER v2_memories_ad AFTER DELETE ON v2_memories BEGIN
        INSERT INTO v2_memories_fts(v2_memories_fts, rowid, story_world_id, memory_id, content)
        VALUES ('delete', old.rowid, old.story_world_id, old.memory_id, old.content);
      END;

      CREATE TRIGGER v2_memories_au AFTER UPDATE OF content ON v2_memories BEGIN
        INSERT INTO v2_memories_fts(v2_memories_fts, rowid, story_world_id, memory_id, content)
        VALUES ('delete', old.rowid, old.story_world_id, old.memory_id, old.content);
        INSERT INTO v2_memories_fts(rowid, story_world_id, memory_id, content)
        VALUES (new.rowid, new.story_world_id, new.memory_id, new.content);
      END;

      CREATE TABLE v2_conversation_summaries (
        conversation_id TEXT PRIMARY KEY REFERENCES v2_conversations(conversation_id) ON DELETE CASCADE,
        summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
        covered_until_message_id TEXT NOT NULL,
        source_message_count INTEGER NOT NULL CHECK (source_message_count >= 0),
        version INTEGER NOT NULL CHECK (version >= 1),
        updated_at TEXT NOT NULL
      );

      CREATE INDEX v2_conversations_world_idx ON v2_conversations(story_world_id, updated_at DESC);
      CREATE INDEX v2_chat_messages_conversation_idx ON v2_chat_messages(conversation_id, created_at, message_id);
      CREATE INDEX v2_memories_world_status_idx ON v2_memories(story_world_id, status, updated_at DESC);
      CREATE INDEX v2_memories_conversation_idx ON v2_memories(conversation_id, updated_at DESC);
      CREATE INDEX v2_memories_supersedes_idx ON v2_memories(supersedes_memory_id);
    `);
  },
  down: (db: DatabaseSync) => {
    db.exec("ALTER TABLE v2_characters DROP COLUMN persona_text;");
    db.exec(`
      DROP INDEX IF EXISTS v2_memories_supersedes_idx;
      DROP INDEX IF EXISTS v2_memories_conversation_idx;
      DROP INDEX IF EXISTS v2_memories_world_status_idx;
      DROP INDEX IF EXISTS v2_chat_messages_conversation_idx;
      DROP INDEX IF EXISTS v2_conversations_world_idx;
      DROP TABLE IF EXISTS v2_conversation_summaries;
      DROP TRIGGER IF EXISTS v2_memories_au;
      DROP TRIGGER IF EXISTS v2_memories_ad;
      DROP TRIGGER IF EXISTS v2_memories_ai;
      DROP TABLE IF EXISTS v2_memories_fts;
      DROP TABLE IF EXISTS v2_memories;
      DROP TABLE IF EXISTS v2_chat_messages;
      DROP TABLE IF EXISTS v2_chat_media;
      DROP TABLE IF EXISTS v2_conversations;
    `);
  },
};
