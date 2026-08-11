import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryDispatchRequestRepository } from "../../../packages/database/src/dispatch.ts";
import { createDispatchPump } from "./dispatch-pump.ts";
import type { WorkerOccurrenceTask } from "./runtime.ts";

function request(id: string, occurrenceId: string) {
  return {
    id,
    batchId: "batch-1",
    candidateId: `candidate-${id}`,
    action: "EXECUTE_EXISTING",
    idempotencyKey: `dispatch:${id}`,
    storyWorldId: "world-1",
    occurrenceId,
    payload: {
      occurrenceId,
      execution: { ruleVersion: "rules-v1" },
    } satisfies WorkerOccurrenceTask,
    status: "PENDING" as const,
    attempts: 0,
    requestedAt: "2026-08-09T00:00:00.000Z",
  };
}

test("dispatch pump uses the request id on the occurrence queue", async () => {
  const repository = createInMemoryDispatchRequestRepository<WorkerOccurrenceTask>([
    request("dispatch-1", "occurrence-1"),
  ]);
  const jobs: Array<{ id: string; payload: WorkerOccurrenceTask }> = [];
  const queue = {
    enqueue: async (id: string, payload: WorkerOccurrenceTask) => {
      jobs.push({ id, payload });
    },
    close: async () => {},
  };

  const pump = createDispatchPump(repository, queue, {
    workerId: "worker-a",
    now: () => "2026-08-09T00:01:00.000Z",
  });

  assert.equal(await pump.runOnce(), 1);
  assert.deepEqual(jobs, [
    {
      id: "dispatch-1",
      payload: {
        occurrenceId: "occurrence-1",
        execution: { ruleVersion: "rules-v1" },
        correlationId: "dispatch-1",
      },
    },
  ]);
  assert.equal(jobs[0]?.payload.correlationId, "dispatch-1");
  assert.equal((await repository.getById("dispatch-1"))?.status, "ENQUEUED");
  assert.equal((await repository.getHeartbeat("worker-a"))?.status, "RUNNING");
});

test("failed enqueue remains pending and records retry details", async () => {
  const repository = createInMemoryDispatchRequestRepository<WorkerOccurrenceTask>([
    request("dispatch-2", "occurrence-2"),
  ]);
  const queue = {
    enqueue: async () => {
      throw new Error("redis down");
    },
    close: async () => {},
  };

  const pump = createDispatchPump(repository, queue, { workerId: "worker-a" });
  assert.equal(await pump.runOnce(), 0);

  const stored = await repository.getById("dispatch-2");
  assert.equal(stored?.status, "PENDING");
  assert.equal(stored?.attempts, 1);
  assert.equal(stored?.lastError, "redis down");
  assert.deepEqual(
    (await repository.listPending(10)).map((item) => item.id),
    ["dispatch-2"],
  );
});

test("dispatch pump rejects invalid payload shape", async () => {
  const repository = createInMemoryDispatchRequestRepository([
    {
      id: "dispatch-bad",
      batchId: "batch-1",
      candidateId: "candidate-bad",
      action: "EXECUTE_EXISTING",
      idempotencyKey: "dispatch:bad",
      storyWorldId: "world-1",
      occurrenceId: "occ-1",
      payload: { occurrenceId: 123, execution: null } as unknown as { occurrenceId: string; execution: Record<string, unknown> },
      status: "PENDING" as const,
      attempts: 0,
      requestedAt: "2026-08-09T00:00:00.000Z",
    },
  ]);
  const queue = { enqueue: async () => {}, close: async () => {} };
  const pump = createDispatchPump(repository, queue, { workerId: "worker-a" });
  assert.equal(await pump.runOnce(), 0);
  const stored = await repository.getById("dispatch-bad");
  assert.equal(stored?.status, "PENDING");
  assert.equal(stored?.attempts, 1);
  assert.ok(stored?.lastError?.includes("WorkerOccurrenceTask"));
});

test("dispatch pump heartbeat sends status to repository", async () => {
  const repository = createInMemoryDispatchRequestRepository<WorkerOccurrenceTask>([]);
  const queue = { enqueue: async () => {}, close: async () => {} };
  const pump = createDispatchPump(repository, queue, {
    workerId: "worker-hb",
    now: () => "2026-08-09T00:02:00.000Z",
  });
  await pump.heartbeat("STOPPED");
  const hb = await repository.getHeartbeat("worker-hb");
  assert.ok(hb);
  assert.equal(hb.status, "STOPPED");
  assert.equal(hb.heartbeatAt, "2026-08-09T00:02:00.000Z");
  assert.deepEqual(hb.metadata, {});
});
