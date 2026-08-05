import assert from "node:assert/strict";
import test from "node:test";

import { PostgresSqlClient } from "./postgres.ts";

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
