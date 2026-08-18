import type { DatabaseSync } from "node:sqlite";

import type { V2SqliteMigration } from "../platform/index.ts";

export const v2FactLedgerMigration: V2SqliteMigration = {
  id: "0400_v2_fact_ledger",
  up: (db: DatabaseSync) => db.exec(`
    CREATE TABLE v2_fact_batches (
      batch_id TEXT PRIMARY KEY,
      story_world_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      from_message_id TEXT NOT NULL,
      to_message_id TEXT NOT NULL,
      source_message_ids_json TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      extractor_version TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
      created_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE (conversation_id, from_message_id, to_message_id, extractor_version)
    );

    CREATE INDEX idx_v2_fact_batches_conversation
      ON v2_fact_batches(conversation_id, created_at);
    CREATE INDEX idx_v2_fact_batches_world
      ON v2_fact_batches(story_world_id, created_at);

    CREATE TABLE v2_fact_assertions (
      assertion_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES v2_fact_batches(batch_id) ON DELETE CASCADE,
      story_world_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('user', 'world', 'character', 'conversation')),
      scope_id TEXT NOT NULL,
      subject_entity_type TEXT NOT NULL,
      subject_entity_id TEXT NOT NULL,
      subject_label TEXT,
      predicate TEXT NOT NULL,
      object_type TEXT NOT NULL CHECK (object_type IN ('text', 'number', 'boolean', 'entity')),
      object_value_json TEXT NOT NULL,
      object_entity_id TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('profile', 'preference', 'relationship', 'episodic', 'world_fact')),
      text TEXT NOT NULL,
      change_hint TEXT NOT NULL CHECK (change_hint IN ('new', 'restate', 'corrects', 'replaces_previous', 'unknown')),
      epistemic_status TEXT CHECK (epistemic_status IN ('asserted', 'observed', 'reported', 'inferred', 'unknown')),
      confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      importance_hint REAL NOT NULL CHECK (importance_hint >= 0 AND importance_hint <= 1),
      source_message_ids_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      extractor_version TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX idx_v2_fact_assertions_batch
      ON v2_fact_assertions(batch_id);
    CREATE INDEX idx_v2_fact_assertions_conversation
      ON v2_fact_assertions(conversation_id);
    CREATE INDEX idx_v2_fact_assertions_world
      ON v2_fact_assertions(story_world_id);
    CREATE INDEX idx_v2_fact_assertions_scope
      ON v2_fact_assertions(scope_type, scope_id);
    CREATE INDEX idx_v2_fact_assertions_subject
      ON v2_fact_assertions(subject_entity_id);
    CREATE INDEX idx_v2_fact_assertions_predicate
      ON v2_fact_assertions(predicate);
    CREATE INDEX idx_v2_fact_assertions_kind
      ON v2_fact_assertions(kind);
    CREATE INDEX idx_v2_fact_assertions_version
      ON v2_fact_assertions(extractor_version);

    CREATE TABLE v2_memory_engine_offsets (
      engine_id TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      last_batch_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (engine_id, scope_key)
    );
  `),
  down: (db: DatabaseSync) => db.exec(`
    DROP TABLE IF EXISTS v2_memory_engine_offsets;
    DROP TABLE IF EXISTS v2_fact_assertions;
    DROP TABLE IF EXISTS v2_fact_batches;
  `),
};

export const v2MemoryEngineRunsMigration: V2SqliteMigration = {
  id: "0410_v2_memory_engine_runs",
  up: (db: DatabaseSync) => db.exec(`
    CREATE TABLE v2_memory_engine_runs (
      run_id TEXT PRIMARY KEY,
      engine_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      input_assertion_count INTEGER NOT NULL DEFAULT 0,
      output_memory_count INTEGER NOT NULL DEFAULT 0,
      llm_call_count INTEGER NOT NULL DEFAULT 0,
      embedding_call_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      error_code TEXT
    );

    CREATE INDEX idx_v2_memory_engine_runs_engine
      ON v2_memory_engine_runs(engine_id, started_at DESC);
  `),
  down: (db: DatabaseSync) => db.exec(`
    DROP TABLE IF EXISTS v2_memory_engine_runs;
  `),
};

export const v2MemoryEngineColumnsMigration: V2SqliteMigration = {
  id: "0420_v2_memory_engine_columns",
  up: (db: DatabaseSync) => {
    const columns = db.prepare("PRAGMA table_info(v2_memories)").all() as unknown as readonly {
      readonly name: string;
    }[];
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("engine_id")) {
      db.exec("ALTER TABLE v2_memories ADD COLUMN engine_id TEXT NOT NULL DEFAULT 'builtin_structured';");
    }
    if (!names.has("source_assertion_ids_json")) {
      db.exec("ALTER TABLE v2_memories ADD COLUMN source_assertion_ids_json TEXT NOT NULL DEFAULT '[]';");
    }
    if (!names.has("slot_key")) {
      db.exec("ALTER TABLE v2_memories ADD COLUMN slot_key TEXT;");
    }
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE v2_memories_0420_backup (
        memory_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL,
        conversation_id TEXT,
        character_id TEXT,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL NOT NULL,
        confidence REAL NOT NULL,
        source_message_ids_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        supersedes_memory_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_accessed_at TEXT
      );
      INSERT INTO v2_memories_0420_backup (
        memory_id, story_world_id, conversation_id, character_id, kind, content,
        importance, confidence, source_message_ids_json, status, supersedes_memory_id,
        created_at, updated_at, last_accessed_at
      )
      SELECT
        memory_id, story_world_id, conversation_id, character_id, kind, content,
        importance, confidence, source_message_ids_json, status, supersedes_memory_id,
        created_at, updated_at, last_accessed_at
      FROM v2_memories;
      DROP TABLE v2_memories;
      ALTER TABLE v2_memories_0420_backup RENAME TO v2_memories;
    `);
  },
};
