import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  revertV2Migrations,
  withV2SqliteTransaction,
  type V2SqliteMigration,
} from "./index.ts";

test("V2 SQLite platform enables foreign keys and transaction rollback", () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    const fk = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    assert.equal(fk.foreign_keys, 1);
    assert.throws(() => withV2SqliteTransaction(db, () => {
      db.exec("CREATE TABLE rollback_probe (id TEXT PRIMARY KEY)");
      throw new Error("rollback");
    }));
    assert.equal(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rollback_probe'").get(),
      undefined,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 SQLite platform runs migration up and down", () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  const migration: V2SqliteMigration = {
    id: "0000_gate0_probe",
    up: (database) => database.exec("CREATE TABLE v2_gate0_probe (id TEXT PRIMARY KEY)"),
    down: (database) => database.exec("DROP TABLE v2_gate0_probe"),
  };
  try {
    applyV2Migrations(db, [migration]);
    assert.notEqual(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'v2_gate0_probe'").get(),
      undefined,
    );
    revertV2Migrations(db, [migration]);
    assert.equal(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'v2_gate0_probe'").get(),
      undefined,
    );
  } finally {
    db.close();
    cleanup();
  }
});
