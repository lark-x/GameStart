import type { DatabaseSync } from "node:sqlite";

import { v2CoreCanonMigrations } from "../core/migrations.ts";
import { v2GenerationJobMigrations } from "../generation/migrations.ts";
import {
  v2FactLedgerMigration,
  v2HybridMemoryMigration,
  v2MemoryEngineColumnsMigration,
  v2MemoryEngineRunsMigration,
  v2MemoryRetrievalTracesMigration,
} from "../fact/migrations.ts";
import {
  v2ChatCoreFinalizationMigration,
  v2ChatMaintenanceCursorsMigration,
  v2ChatMaintenanceJobsMigration,
  v2ChatMaintenanceDedupeKeyMigration,
  v2ChatMemoryMigration,
  v2ChatStoryAnalyzeCursorMigration,
  v2ChatTracesMigration,
} from "../chat/migrations.ts";

export interface V2SqliteMigration {
  readonly id: string;
  readonly up: (db: DatabaseSync) => void;
  readonly down: (db: DatabaseSync) => void;
}

export interface V2MigrationRegistry {
  readonly migrations: readonly V2SqliteMigration[];
}

export const v2CoreMigrations: V2MigrationRegistry = { migrations: v2CoreCanonMigrations };
export const v2GenerationMigrations: V2MigrationRegistry = { migrations: v2GenerationJobMigrations };

export const v2PlatformMigrations: V2MigrationRegistry = {
  migrations: [
    {
      id: "0200_v2_platform_configuration",
      up: (db) => db.exec(`
        CREATE TABLE v2_model_profiles (
          profile_id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          protocol TEXT NOT NULL CHECK (protocol IN ('openai-compatible', 'anthropic')),
          base_url TEXT NOT NULL,
          model TEXT NOT NULL,
          timeout_ms INTEGER NOT NULL CHECK (timeout_ms >= 1),
          max_tokens INTEGER NOT NULL CHECK (max_tokens >= 1),
          temperature REAL NOT NULL CHECK (temperature >= 0 AND temperature <= 2),
          encrypted_api_key TEXT,
          encryption_iv TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK ((encrypted_api_key IS NULL AND encryption_iv IS NULL) OR
                 (encrypted_api_key IS NOT NULL AND encryption_iv IS NOT NULL))
        );

        CREATE TABLE v2_model_bindings (
          capability TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES v2_model_profiles(profile_id) ON DELETE RESTRICT,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE v2_image_service_settings (
          singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
          base_url TEXT NOT NULL DEFAULT '',
          timeout_ms INTEGER NOT NULL DEFAULT 30000 CHECK (timeout_ms >= 1),
          default_workflow_version TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE v2_appearance_settings (
          singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
          theme_id TEXT NOT NULL DEFAULT 'dawn',
          updated_at TEXT NOT NULL
        );

        INSERT INTO v2_image_service_settings (singleton_id, base_url, timeout_ms, updated_at)
        VALUES (1, '', 30000, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        INSERT INTO v2_appearance_settings (singleton_id, theme_id, updated_at)
        VALUES (1, 'dawn', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `),
      down: (db) => db.exec(`
        DROP TABLE v2_appearance_settings;
        DROP TABLE v2_image_service_settings;
        DROP TABLE v2_model_bindings;
        DROP TABLE v2_model_profiles;
      `),
    },
    {
      id: "0201_v2_model_call_logs",
      up: (db) => db.exec(`
        CREATE TABLE v2_model_call_logs (
          log_id TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error', 'interrupted')),
          capability TEXT NOT NULL,
          profile_id TEXT,
          profile_name TEXT,
          protocol TEXT CHECK (protocol IS NULL OR protocol IN ('openai-compatible', 'anthropic')),
          model TEXT,
          correlation_id TEXT,
          job_id TEXT,
          story_world_id TEXT,
          provider_response_id TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
          prompt_tokens INTEGER CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
          completion_tokens INTEGER CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
          total_tokens INTEGER CHECK (total_tokens IS NULL OR total_tokens >= 0),
          finish_reason TEXT,
          request_messages_json TEXT,
          response_text TEXT,
          request_truncated INTEGER NOT NULL DEFAULT 0 CHECK (request_truncated IN (0, 1)),
          response_truncated INTEGER NOT NULL DEFAULT 0 CHECK (response_truncated IN (0, 1)),
          error_code TEXT,
          error_status INTEGER,
          error_retryable INTEGER CHECK (error_retryable IS NULL OR error_retryable IN (0, 1)),
          error_message TEXT
        );

        CREATE INDEX v2_model_call_logs_started_idx
          ON v2_model_call_logs (started_at DESC, log_id DESC);
        CREATE INDEX v2_model_call_logs_status_idx
          ON v2_model_call_logs (status, started_at DESC, log_id DESC);
        CREATE INDEX v2_model_call_logs_correlation_idx
          ON v2_model_call_logs (correlation_id, started_at DESC);
        CREATE INDEX v2_model_call_logs_job_idx
          ON v2_model_call_logs (job_id, started_at DESC);
        CREATE INDEX v2_model_call_logs_profile_idx
          ON v2_model_call_logs (profile_id, started_at DESC);
      `),
      down: (db) => db.exec(`DROP TABLE v2_model_call_logs;`),
    },
    {
      id: "0202_v2_external_connection_checks",
      up: (db) => db.exec(`
        CREATE TABLE v2_external_connection_checks (
          service TEXT PRIMARY KEY CHECK (service IN ('model', 'comfyui')),
          connection TEXT NOT NULL CHECK (connection IN ('untested', 'checking', 'ok', 'failed')),
          checked_at TEXT NOT NULL,
          duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
          error_message TEXT
        );
      `),
      down: (db) => db.exec(`DROP TABLE v2_external_connection_checks;`),
    },
    {
      id: "0203_v2_model_profile_context_modalities",
      up: (db) => {
        const columns = db.prepare("PRAGMA table_info(v2_model_profiles)").all() as unknown as readonly {
          readonly name: string;
        }[];
        const names = new Set(columns.map((column) => column.name));
        if (!names.has("context_window")) {
          db.exec("ALTER TABLE v2_model_profiles ADD COLUMN context_window INTEGER;");
        }
        if (!names.has("input_modalities_json")) {
          db.exec("ALTER TABLE v2_model_profiles ADD COLUMN input_modalities_json TEXT;");
        }
      },
      down: (db) => {
        // SQLite cannot drop columns before 3.35; recreate the table without the new columns.
        db.exec(`
          CREATE TABLE v2_model_profiles_0203_backup (
            profile_id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            protocol TEXT NOT NULL CHECK (protocol IN ('openai-compatible', 'anthropic')),
            base_url TEXT NOT NULL,
            model TEXT NOT NULL,
            timeout_ms INTEGER NOT NULL CHECK (timeout_ms >= 1),
            max_tokens INTEGER NOT NULL CHECK (max_tokens >= 1),
            temperature REAL NOT NULL CHECK (temperature >= 0 AND temperature <= 2),
            encrypted_api_key TEXT,
            encryption_iv TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            CHECK ((encrypted_api_key IS NULL AND encryption_iv IS NULL) OR
                   (encrypted_api_key IS NOT NULL AND encryption_iv IS NOT NULL))
          );
          INSERT INTO v2_model_profiles_0203_backup (
            profile_id, name, protocol, base_url, model, timeout_ms, max_tokens,
            temperature, encrypted_api_key, encryption_iv, created_at, updated_at
          )
          SELECT
            profile_id, name, protocol, base_url, model, timeout_ms, max_tokens,
            temperature, encrypted_api_key, encryption_iv, created_at, updated_at
          FROM v2_model_profiles;
          DROP TABLE v2_model_profiles;
          ALTER TABLE v2_model_profiles_0203_backup RENAME TO v2_model_profiles;
        `);
      },
    },
  ],
};

export function getV2Migrations(): readonly V2SqliteMigration[] {
  return [
    ...v2CoreMigrations.migrations,
    ...v2GenerationMigrations.migrations,
    ...v2PlatformMigrations.migrations,
    v2ChatMemoryMigration,
    v2ChatCoreFinalizationMigration,
    v2ChatMaintenanceJobsMigration,
    v2ChatMaintenanceCursorsMigration,
    v2ChatTracesMigration,
    v2ChatStoryAnalyzeCursorMigration,
    v2ChatMaintenanceDedupeKeyMigration,
    v2FactLedgerMigration,
    v2HybridMemoryMigration,
    v2MemoryEngineRunsMigration,
    v2MemoryEngineColumnsMigration,
    v2MemoryRetrievalTracesMigration,
  ].sort((a, b) => a.id.localeCompare(b.id));
}

export function listV2Migrations(): readonly V2SqliteMigration[] {
  return getV2Migrations();
}

export function applyV2Migrations(db: DatabaseSync, migrations: readonly V2SqliteMigration[] = getV2Migrations()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS v2_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  for (const migration of migrations) {
    const row = db.prepare("SELECT id FROM v2_schema_migrations WHERE id = ?").get(migration.id);
    if (row !== undefined) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      migration.up(db);
      db.prepare("INSERT INTO v2_schema_migrations (id) VALUES (?)").run(migration.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function revertV2Migrations(db: DatabaseSync, migrations: readonly V2SqliteMigration[] = getV2Migrations()): void {
  for (const migration of [...migrations].reverse()) {
    const row = db.prepare("SELECT id FROM v2_schema_migrations WHERE id = ?").get(migration.id);
    if (row === undefined) continue;
    migration.down(db);
    db.prepare("DELETE FROM v2_schema_migrations WHERE id = ?").run(migration.id);
  }
}
