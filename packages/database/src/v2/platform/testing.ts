import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openV2SqliteConnection } from "./connection.ts";

export function createV2TempSqliteDatabase(prefix = "living-network-v2-"): {
  readonly path: string;
  readonly cleanup: () => void;
} {
  const dir = join(tmpdir(), `${prefix}${crypto.randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "test.sqlite");
  return {
    path,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Safe on Windows when sqlite lock briefly lingers
      }
    },
  };
}

export function openV2TempSqliteConnection() {
  const temp = createV2TempSqliteDatabase();
  const db = openV2SqliteConnection({ path: temp.path });
  return { db, cleanup: temp.cleanup, path: temp.path };
}
