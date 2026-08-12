import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface V2SqliteConnectionOptions {
  readonly path: string;
  readonly enableWal?: boolean;
  readonly busyTimeoutMs?: number;
}

export function openV2SqliteConnection(options: V2SqliteConnectionOptions): DatabaseSync {
  if (options.path !== ":memory:") mkdirSync(dirname(options.path), { recursive: true });
  const db = new DatabaseSync(options.path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`PRAGMA busy_timeout = ${options.busyTimeoutMs ?? 5000}`);
  if (options.enableWal ?? options.path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  return db;
}

export function withV2SqliteTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
