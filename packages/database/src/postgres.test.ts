import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresSqlClient, PostgresSqlClient } from "./postgres.ts";

test("PostgresSqlClient forwards parameterized queries and closes its pool", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  let closed = false;
  const client = new PostgresSqlClient({
    async query<Row extends Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      queries.push({ text, ...(values === undefined ? {} : { values }) });
      return { rows: [{ ok: true }] as unknown as Row[] };
    },
    async end() {
      closed = true;
    },
  });
  const result = await client.query<{ ok: boolean }>("SELECT $1 AS ok", [true]);
  assert.deepEqual(result.rows, [{ ok: true }]);
  await client.close();
  assert.equal(closed, true);
  assert.deepEqual(queries, [{ text: "SELECT $1 AS ok", values: [true] }]);
});

test("PostgresSqlClient wraps work in a transaction and rolls back failures", async () => {
  const statements: string[] = [];
  const released: boolean[] = [];
  const client = new PostgresSqlClient({
    async query(text) {
      statements.push(text);
      return { rows: [] };
    },
    async connect() {
      return {
        async query(text) {
          statements.push(text);
          return { rows: [] };
        },
        release() {
          released.push(true);
        },
      };
    },
  });
  await assert.rejects(
    client.transaction(async (transaction) => {
      await transaction.query("INSERT INTO demo VALUES ($1)", [1]);
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.deepEqual(statements, ["BEGIN", "INSERT INTO demo VALUES ($1)", "ROLLBACK"]);
  assert.deepEqual(released, [true]);
});

test("PostgresSqlClient commits successful transactions and creates an optional pg pool", async () => {
  const statements: string[] = [];
  const client = new PostgresSqlClient({
    async query(text) {
      statements.push(text);
      return { rows: [] };
    },
    async connect() {
      return {
        async query(text) {
          statements.push(text);
          return { rows: [] };
        },
        release() {},
      };
    },
  });
  assert.equal(await client.transaction(async (transaction) => {
    await transaction.query("SELECT 1");
    return "committed";
  }), "committed");
  assert.deepEqual(statements, ["BEGIN", "SELECT 1", "COMMIT"]);

  await assert.rejects(createPostgresSqlClient({ connectionString: " " }), /connectionString/);
  const pooled = await createPostgresSqlClient({
    connectionString: "postgresql://127.0.0.1:5432/in-memory-test",
    max: 1,
    idleTimeoutMillis: 5,
  });
  await pooled.close();
});

test("PostgresSqlClient rejects unsupported transactions and tolerates rollback errors", async () => {
  const noTransactions = new PostgresSqlClient({
    async query() { return { rows: [] }; },
  });
  await assert.rejects(
    noTransactions.transaction(async () => "never"),
    /does not support transactions/,
  );

  const client = new PostgresSqlClient({
    async query() { return { rows: [] }; },
    async connect() {
      return {
        async query(text: string) {
          if (text === "ROLLBACK") throw new Error("rollback unavailable");
          if (text === "BEGIN") return { rows: [] };
          throw new Error("operation failed");
        },
        release() {},
      };
    },
  });
  await assert.rejects(client.transaction(async () => {
    throw new Error("operation failed");
  }), /operation failed/);
});
