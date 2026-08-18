import assert from "node:assert/strict";
import test from "node:test";

import { openV2TempSqliteConnection, applyV2Migrations, getV2Migrations } from "../packages/database/src/v2/index.ts";
import { BullMqTaskQueue, BullMqTaskWorker } from "../apps/worker/src/queue.ts";

const enabled = process.env.RUN_V2_REAL_INTEGRATION === "1";

test("V2 real-service lane applies SQLite migrations and round-trips a BullMQ job through Redis", { skip: !enabled }, async () => {
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const { db, cleanup } = openV2TempSqliteConnection();
  const queueName = `v2-real-service-${Date.now()}`;
  const queue = new BullMqTaskQueue<{ value: number }>(queueName, { url: redisUrl, prefix: "living-network-v2-test" });
  let resolve: (() => void) | undefined;
  const completed = new Promise<void>((done) => { resolve = done; });
  const worker = new BullMqTaskWorker<{ value: number }, void>(
    queueName,
    { url: redisUrl, prefix: "living-network-v2-test" },
    async (payload) => {
      assert.equal(payload.value, 42);
      resolve?.();
    },
  );
  try {
    applyV2Migrations(db);
    const applied = db.prepare("SELECT COUNT(*) AS count FROM v2_schema_migrations").get() as { count: number };
    assert.equal(applied.count, getV2Migrations().length);
    await queue.enqueue("real-service-task", { value: 42 }, { attempts: 1 });
    await Promise.race([
      completed,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Redis job did not complete")), 10_000)),
    ]);
  } finally {
    await worker.close();
    await queue.close();
    db.close();
    cleanup();
  }
});
