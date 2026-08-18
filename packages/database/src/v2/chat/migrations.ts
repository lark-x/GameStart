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

export const v2ChatCoreFinalizationMigration: V2SqliteMigration = {
  id: "0310_v2_chat_core_finalization",
  up: (db) => {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS v2_chat_media_content_hash_idx
      ON v2_chat_media(content_hash);
    `);
  },
  down: (db) => {
    db.exec("DROP INDEX IF EXISTS v2_chat_media_content_hash_idx;");
  },
};

export const v2ChatMaintenanceJobsMigration: V2SqliteMigration = {
  id: "0330_v2_chat_maintenance_jobs",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS v2_chat_maintenance_jobs (
        job_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        available_at TEXT NOT NULL,
        lease_expires_at TEXT,
        claimed_by TEXT,
        last_started_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_error TEXT,
        FOREIGN KEY (conversation_id) REFERENCES v2_conversations(conversation_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_v2_chat_maint_poll
      ON v2_chat_maintenance_jobs(status, available_at);

      CREATE INDEX IF NOT EXISTS idx_v2_chat_maint_conv_type
      ON v2_chat_maintenance_jobs(conversation_id, job_type, status);
    `);
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_v2_chat_maint_conv_type;
      DROP INDEX IF EXISTS idx_v2_chat_maint_poll;
      DROP TABLE IF EXISTS v2_chat_maintenance_jobs;
    `);
  },
};

export const v2ChatMaintenanceCursorsMigration: V2SqliteMigration = {
  id: "0340_v2_chat_maintenance_cursors",
  up: (db) => db.exec(`
    CREATE TABLE v2_chat_maintenance_cursors (
      conversation_id TEXT PRIMARY KEY REFERENCES v2_conversations(conversation_id) ON DELETE CASCADE,
      memory_extracted_until_message_id TEXT,
      updated_at TEXT NOT NULL
    );
  `),
  down: (db) => db.exec(`
    DROP TABLE IF EXISTS v2_chat_maintenance_cursors;
  `),
};

export const v2ChatTracesMigration: V2SqliteMigration = {
  id: "0350_v2_chat_traces",
  up: (db) => db.exec(`
    CREATE TABLE v2_chat_traces (
      trace_id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES v2_conversations(conversation_id) ON DELETE CASCADE,
      message_id TEXT,
      task TEXT,
      template_id TEXT,
      template_version TEXT,
      context_hash TEXT,
      profile_id TEXT,
      model TEXT,
      context_window INTEGER,
      input_budget INTEGER,
      estimated_tokens INTEGER,
      recent_message_count INTEGER,
      memory_ids_json TEXT,
      canon_ids_json TEXT,
      summary_version INTEGER,
      image_count INTEGER,
      started_at TEXT NOT NULL,
      first_token_latency_ms INTEGER,
      total_latency_ms INTEGER,
      status TEXT NOT NULL CHECK (status IN ('pending', 'streaming', 'completed', 'failed')),
      error_code TEXT
    );

    CREATE INDEX idx_v2_chat_traces_conv_started
      ON v2_chat_traces(conversation_id, started_at DESC);
  `),
  down: (db) => db.exec(`
    DROP TABLE IF EXISTS v2_chat_traces;
  `),
};

export const v2ChatMigrations: readonly V2SqliteMigration[] = [
  v2ChatMemoryMigration,
  v2ChatCoreFinalizationMigration,
  v2ChatMaintenanceJobsMigration,
  v2ChatMaintenanceCursorsMigration,
  v2ChatTracesMigration,
];
