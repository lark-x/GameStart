import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { applyMigrations, listMigrationFiles, type MigrationDatabase } from "./migrations.ts";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../migrations");

function diskSqlFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

test("migration registry has continuous versions with no duplicates", () => {
  const migrations = listMigrationFiles();
  const versions = migrations.map((m) => m.version);
  const names = migrations.map((m) => m.name);
  assert.equal(new Set(versions).size, versions.length, "duplicate version detected");
  assert.equal(new Set(names).size, names.length, "duplicate name detected");
  for (let i = 0; i < versions.length; i++) {
    assert.equal(versions[i], i + 1, `expected version ${i + 1} but got ${versions[i]}`);
  }
});

test("every registered migration has both up and down files on disk", () => {
  const migrations = listMigrationFiles();
  for (const migration of migrations) {
    const upPath = join(MIGRATIONS_DIR, `${migration.name}.sql`);
    const downPath = join(MIGRATIONS_DIR, `${migration.name}.down.sql`);
    assert.ok(statSync(upPath).isFile(), `missing up file: ${migration.name}.sql`);
    assert.ok(statSync(downPath).isFile(), `missing down file: ${migration.name}.down.sql`);
  }
});

test("no unregistered migration files exist on disk", () => {
  const migrations = listMigrationFiles();
  const registeredNames = new Set(migrations.map((m) => m.name));
  const sqlFiles = diskSqlFiles();
  for (const file of sqlFiles) {
    const name = file.replace(/\.down\.sql$/, "").replace(/\.sql$/, "");
    assert.ok(
      registeredNames.has(name),
      `unregistered migration file on disk: ${file} — add "${name}" to migrationNames`,
    );
  }
});

test("migration files are ordered and include reversible SQL", async () => {
  const migrations = listMigrationFiles();
  assert.deepEqual(
    migrations.map((migration) => migration.version),
    Array.from({ length: 24 }, (_, i) => i + 1),
  );
  const storyGraphMigration = migrations.find((migration) => migration.version === 20);
  assert.ok(storyGraphMigration);
  const storyGraphUp = await (await import("node:fs/promises")).readFile(storyGraphMigration.upPath, "utf8");
  assert.match(storyGraphUp, /CREATE TABLE story_arcs/);
  assert.match(storyGraphUp, /CREATE TABLE story_nodes/);
  assert.match(storyGraphUp, /CREATE TABLE story_edges/);
  assert.match(storyGraphUp, /CREATE TABLE prompt_templates/);
  assert.match(storyGraphUp, /CREATE TABLE memory_candidates/);
  const storyGraphDown = await (await import("node:fs/promises")).readFile(storyGraphMigration.downPath, "utf8");
  assert.match(storyGraphDown, /DROP TABLE IF EXISTS memory_candidates/);
  assert.match(storyGraphDown, /DROP TABLE IF EXISTS prompt_templates/);
  assert.match(storyGraphDown, /DROP TABLE IF EXISTS story_edges/);
  assert.match(storyGraphDown, /DROP TABLE IF EXISTS story_nodes/);
  assert.match(storyGraphDown, /DROP TABLE IF EXISTS story_arcs/);
  for (const migration of migrations) {
    assert.match(await (await import("node:fs/promises")).readFile(migration.upPath, "utf8"), /(CREATE TABLE|ALTER TABLE|CREATE INDEX)/);
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
