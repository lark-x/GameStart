import assert from "node:assert/strict";
import test from "node:test";

import { BullMqTaskQueue, BullMqTaskWorker, parseRedisConnection } from "./queue.ts";

test("queue validates Redis URL schemes without accepting arbitrary endpoints", () => {
  assert.deepEqual(parseRedisConnection("redis://127.0.0.1:6379"), {
    url: "redis://127.0.0.1:6379",
  });
  assert.deepEqual(parseRedisConnection("rediss://cache.example/0"), {
    url: "rediss://cache.example/0",
  });
  assert.throws(() => parseRedisConnection("http://cache.example"), /redis/);
  assert.throws(() => parseRedisConnection("not a url"), /valid/);
});

test("BullMQ adapters validate names, options, and close cleanly without enqueueing", async () => {
  assert.throws(
    () => new BullMqTaskQueue(" ", { url: "redis://127.0.0.1:6379" }),
    /queue name must not be empty/,
  );
  const queue = new BullMqTaskQueue<{ value: number }>("unit-test-queue", {
    url: "redis://127.0.0.1:6379",
    prefix: "unit-test",
  });
  await assert.rejects(queue.enqueue("", { value: 1 }), /taskId must not be empty/);
  await assert.rejects(queue.enqueue("task", { value: 1 }, { attempts: 0 }), /attempts/);
  await assert.rejects(queue.enqueue("task", { value: 1 }, { attempts: 21 }), /attempts/);
  await queue.close();

  assert.throws(
    () => new BullMqTaskWorker("unit-test-worker", { url: "redis://127.0.0.1:6379" }, async () => "ok", { concurrency: 0 }),
    /concurrency/,
  );
  const worker = new BullMqTaskWorker("unit-test-worker", { url: "redis://127.0.0.1:6379" }, async () => "ok", {
    concurrency: 2,
    prefix: "worker-prefix",
  });
  await worker.close();
});
