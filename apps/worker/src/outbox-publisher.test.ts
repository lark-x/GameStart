import assert from "node:assert/strict";
import test from "node:test";

import { OutboxPublisher, type OutboxQueueTask } from "./outbox-publisher.ts";

function event(id: string) {
  return {
    id,
    aggregateType: "message",
    aggregateId: id,
    eventType: "message.created",
    payload: { id },
    idempotencyKey: `${id}.created`,
    createdAt: "2026-08-05T00:00:00.000Z",
    attempts: 0,
  };
}

test("outbox publisher marks events only after queue enqueue succeeds", async () => {
  const events = [event("event-1"), event("event-2")];
  const marked: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const queued: string[] = [];
  const outbox = {
    async listUnpublished() { return events; },
    async markPublished(id: string) { marked.push(id); return event(id); },
    async markFailed(id: string, error: string) { failed.push({ id, error }); return event(id); },
    async append() { throw new Error("not used"); },
  };
  const queue = {
    async enqueue(id: string, _data: OutboxQueueTask) {
      if (id === "event-2") throw new Error("redis unavailable");
      queued.push(id);
    },
    async close() {},
  };
  const publisher = new OutboxPublisher(outbox, queue, () => new Date("2026-08-05T01:00:00.000Z"));
  const result = await publisher.publishBatch();
  assert.deepEqual(result, { published: ["event-1"], failed: ["event-2"] });
  assert.deepEqual(queued, ["event-1"]);
  assert.deepEqual(marked, ["event-1"]);
  assert.deepEqual(failed, [{ id: "event-2", error: "redis unavailable" }]);
});
