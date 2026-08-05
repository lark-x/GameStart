import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMigrations,
  createPostgresSqlClient,
  createSqlRepositories,
} from "../packages/database/src/index.ts";
import {
  BullMqTaskQueue,
  BullMqTaskWorker,
  OutboxPublisher,
} from "../apps/worker/src/index.ts";

const enabled = process.env.RUN_REAL_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://living_network:living_network_dev_only@127.0.0.1:5432/living_network";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

test("real PostgreSQL migration, transaction, outbox and Redis queue", { skip: !enabled }, async () => {
  const database = await createPostgresSqlClient({ connectionString: databaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const queueName = `real-integration-${suffix}`;
  const prefix = `living-real-${suffix}`;
  try {
    const migration = await applyMigrations(database);
    assert.deepEqual(migration.applied, []);
    const repositories = createSqlRepositories(database);
    const eventId = `real-outbox-${suffix}`;
    await repositories.transaction(async (transaction) => {
      await transaction.outboxEvents.append({
        id: eventId,
        aggregateType: "integration",
        aggregateId: eventId,
        eventType: "integration.checked",
        payload: { ok: true },
        idempotencyKey: eventId,
        createdAt: new Date().toISOString(),
      });
    });
    const queue = new BullMqTaskQueue(queueName, { url: redisUrl, prefix });
    let resolveProcessed: (() => void) | undefined;
    const processed = new Promise<void>((resolve) => { resolveProcessed = resolve; });
    const worker = new BullMqTaskWorker(queueName, { url: redisUrl, prefix }, async (data) => {
      assert.equal(data.eventId, eventId);
      resolveProcessed?.();
    });
    try {
      const publisher = new OutboxPublisher(repositories.outboxEvents, queue);
      const result = await publisher.publishBatch();
      assert.deepEqual(result.published, [eventId]);
      await Promise.race([
        processed,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Redis job timeout")), 10_000)),
      ]);
      assert.equal((await repositories.outboxEvents.listUnpublished(100)).some((event) => event.id === eventId), false);
    } finally {
      await worker.close();
      await queue.close();
    }
  } finally {
    await database.close();
  }
});
