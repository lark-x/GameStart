import assert from "node:assert/strict";
import test from "node:test";

import { applyMigrations, listMigrationFiles, type MigrationDatabase } from "./migrations.ts";

test("migration files are ordered and include reversible SQL", async () => {
  const migrations = listMigrationFiles();
  assert.deepEqual(migrations.map((migration) => migration.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const migration of migrations) {
    assert.match(await (await import("node:fs/promises")).readFile(migration.upPath, "utf8"), /CREATE TABLE/);
    assert.match(await (await import("node:fs/promises")).readFile(migration.downPath, "utf8"), /DROP/);
  }
});

test("applyMigrations only runs missing versions in order", async () => {
  const statements: string[] = [];
  const database: MigrationDatabase = {
    async query<Row extends Record<string, unknown>>(text: string): Promise<{ rows: readonly Row[] }> {
      statements.push(text.trim());
      if (text.includes("SELECT version")) {
        return { rows: [{ version: 1, name: "0001_initial" }] as unknown as Row[] };
      }
      return { rows: [] };
    },
  };
  const migrations = listMigrationFiles().slice(0, 2);
  const result = await applyMigrations(database, migrations);
  assert.deepEqual(result.applied, [2]);
  assert.equal(statements.some((statement) => statement.includes("INSERT INTO living_network_schema_migrations")), true);
});

test("applyMigrations uses the transaction boundary when provided", async () => {
  const calls: string[] = [];
  const database: MigrationDatabase = {
    async query<Row extends Record<string, unknown>>(text: string): Promise<{ rows: readonly Row[] }> {
      calls.push(`query:${text.trim().slice(0, 20)}`);
      if (text.includes("SELECT version")) return { rows: [] };
      return { rows: [] };
    },
    async transaction(operation) {
      calls.push("transaction");
      return operation(database);
    },
  };
  const result = await applyMigrations(database, listMigrationFiles().slice(0, 1));
  assert.deepEqual(result.applied, [1]);
  assert.equal(calls.includes("transaction"), true);
});
