import type { DatabaseSync } from "node:sqlite";

export interface V2SqliteMigration {
  readonly id: string;
  readonly up: (db: DatabaseSync) => void;
  readonly down: (db: DatabaseSync) => void;
}

export interface V2MigrationRegistry {
  readonly migrations: readonly V2SqliteMigration[];
}

export const v2CoreMigrations: V2MigrationRegistry = { migrations: [] };
export const v2GenerationMigrations: V2MigrationRegistry = { migrations: [] };

export function getV2Migrations(): readonly V2SqliteMigration[] {
  return [...v2CoreMigrations.migrations, ...v2GenerationMigrations.migrations]
    .sort((a, b) => a.id.localeCompare(b.id));
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
    migration.up(db);
    db.prepare("INSERT INTO v2_schema_migrations (id) VALUES (?)").run(migration.id);
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
