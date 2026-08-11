import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryInteractionLogRepository } from "@living-network/database";
import { bestEffortLog } from "./interaction-log.ts";

test("worker adapter emits database-compatible structured entries", async () => {
  const repository = new InMemoryInteractionLogRepository();
  await bestEffortLog(repository, { event: "dispatch", phase: "enqueue", outcome: "SUCCESS", correlationId: "worker:dispatch:request-1", entityType: "dispatch_request", entityId: "request-1", message: "hello" });
  const item = (await repository.query()).items[0]!;
  assert.equal(item.action, "dispatch.enqueue");
  assert.equal(item.entityType, "dispatch_request");
  assert.equal(item.entityId, "request-1");
});

test("worker adapter keeps useful event details at the top level", async () => {
  const repository = new InMemoryInteractionLogRepository();
  await bestEffortLog(repository, { action: "image.submit", category: "IMAGE", outcome: "SUCCESS", correlationId: "worker:image:1", jobId: "image-1", details: { service: "ComfyUI", prompt: "rainy cafe" } });
  const item = (await repository.query()).items[0]!;
  assert.equal(item.category, "IMAGE");
  assert.deepEqual(item.details, { jobId: "image-1", service: "ComfyUI", prompt: "rainy cafe" });
});

test("worker adapter swallows repository failures and redacts sentinel secrets", async () => {
  const seen: unknown[] = [];
  await bestEffortLog({ append: async (input) => { seen.push(input); throw new Error("log unavailable"); }, query: async () => ({ items: [] }), deleteOlderThan: async () => 0 }, { action: "test", outcome: "SUCCESS", correlationId: "worker:test:1", message: "safe preview", details: { token: "SENTINEL_SECRET", nested: {} } });
  assert.equal(seen.length, 1);
  assert.equal(JSON.stringify(seen).includes("SENTINEL_SECRET"), false);
});

test("worker adapter accepts circular and throwing values", async () => {
  const repository = new InMemoryInteractionLogRepository();
  const value: Record<string, unknown> = {};
  value.self = value;
  Object.defineProperty(value, "boom", { enumerable: true, get() { throw new Error("boom"); } });
  await bestEffortLog(repository, { action: "test", outcome: "SUCCESS", correlationId: "worker:test:2", details: value });
  assert.equal((await repository.query()).items.length, 1);
});
