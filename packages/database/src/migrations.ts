import { readFile } from "node:fs/promises";

import type { SqlClient, SqlRow } from "./sql.ts";

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly upPath: URL;
  readonly downPath: URL;
}

export interface MigrationDatabase extends SqlClient {
  transaction?<T>(operation: (client: SqlClient) => Promise<T>): Promise<T>;
}

const migrationNames = [
  "0001_initial",
  "0002_chat",
  "0003_memory",
  "0004_events",
  "0005_life_simulation",
  "0006_behavior_media",
  "0007_social_feed",
  "0008_visual_workflows",
  "0009_stickers",
  "0010_outbox",
  "0011_appearance",
  "0012_integrations",
  "0013_character_persona",
  "0014_world_lore",
  "0015_event_output_policy",
  "0016_execution_dispatch_requests",
  "0017_interaction_logs",
] as const;

export function listMigrationFiles(): readonly MigrationFile[] {
  return migrationNames.map((name) => ({
    version: Number(name.slice(0, 4)),
    name,
    upPath: new URL(`../migrations/${name}.sql`, import.meta.url),
    downPath: new URL(`../migrations/${name}.down.sql`, import.meta.url),
  }));
}

export async function readMigration(
  migration: MigrationFile,
  direction: "up" | "down" = "up",
): Promise<string> {
  return readFile(direction === "up" ? migration.upPath : migration.downPath, "utf8");
}

const MIGRATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS living_network_schema_migrations (
  version integer PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

interface AppliedMigrationRow extends SqlRow {
  version: number | string;
  name: string;
}

export interface MigrationRunResult {
  readonly applied: readonly number[];
  readonly current: readonly number[];
}

async function applyMigration(
  database: SqlClient,
  migration: MigrationFile,
): Promise<void> {
  const sql = await readMigration(migration);
  const executable = sql
    .replace(/^\s*BEGIN\s*;\s*/i, "")
    .replace(/\s*COMMIT\s*;\s*$/i, "");
  await database.query(executable);
  await database.query(
    "INSERT INTO living_network_schema_migrations (version, name) VALUES ($1, $2)",
    [migration.version, migration.name],
  );
}

/** Apply missing migrations in order. It never executes down migrations. */
export async function applyMigrations(
  database: MigrationDatabase,
  migrations: readonly MigrationFile[] = listMigrationFiles(),
): Promise<MigrationRunResult> {
  await database.query(MIGRATION_TABLE_SQL);
  const result = await database.query<AppliedMigrationRow>(
    "SELECT version, name FROM living_network_schema_migrations ORDER BY version",
  );
  const appliedVersions = new Set(result.rows.map((row) => Number(row.version)));
  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));
  for (const migration of pending) {
    if (database.transaction) {
      await database.transaction((client) => applyMigration(client, migration));
    } else {
      await applyMigration(database, migration);
    }
  }
  const current = [...appliedVersions, ...pending.map((migration) => migration.version)].sort((a, b) => a - b);
  return { applied: pending.map((migration) => migration.version), current };
}
