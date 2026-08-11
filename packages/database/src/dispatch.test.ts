import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  EventRecurrenceKind,
  ScheduledOccurrenceStatus,
  StoryMode,
  TriggerSource,
  createCharacter,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
} from "../../domain/src/index.ts";
import {
  createInMemoryRepositories,
  createSqlRepositories,
  type ExecutionDispatchRequest,
  type SqlClient,
  type SqlQueryResult,
  type SqlRow,
} from "./index.ts";

const world = createStoryWorld({
  id: "dispatch-world",
  name: "Dispatch World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "dispatch-character",
  displayName: "Aster",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const definition = createWorldEventDefinition({
  id: "dispatch-definition",
  storyWorld: world,
  eventKey: "dispatch:event",
  name: "Dispatch event",
  triggerSource: TriggerSource.MANUAL,
  recurrence: {
    kind: EventRecurrenceKind.ONCE,
    runAt: "2026-08-09T01:00:00.000Z",
  },
  targetCharacters: [character],
  createdAt: "2026-08-09T00:00:00.000Z",
});

function occurrence(id: string, status: ScheduledOccurrenceStatus, scheduledFor: string) {
  return {
    ...createScheduledOccurrence({
      id,
      definition,
      scheduledFor,
      occurrenceKey: `dispatch:event:${id}`,
      createdAt: "2026-08-09T00:00:00.000Z",
    }),
    status,
  };
}

function dispatch(
  id: string,
  idempotencyKey: string,
  occurrenceId = "occurrence-pending",
): ExecutionDispatchRequest {
  return {
    id,
    batchId: "batch-1",
    candidateId: `candidate-${id}`,
    action: "EXECUTE_EXISTING",
    idempotencyKey,
    storyWorldId: world.id,
    occurrenceId,
    payload: {
      occurrenceId,
      execution: { ruleVersion: "rules-v1" },
    },
    status: "PENDING",
    attempts: 0,
    requestedAt: "2026-08-09T00:00:00.000Z",
  };
}

test("creator scan includes active states through horizon and excludes terminal states", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [
      occurrence("occurrence-pending", ScheduledOccurrenceStatus.PENDING, "2026-08-09T01:00:00.000Z"),
      occurrence("occurrence-failed", ScheduledOccurrenceStatus.FAILED, "2026-08-09T02:00:00.000Z"),
      occurrence("occurrence-running", ScheduledOccurrenceStatus.RUNNING, "2026-08-09T03:00:00.000Z"),
      occurrence("occurrence-completed", ScheduledOccurrenceStatus.COMPLETED, "2026-08-09T04:00:00.000Z"),
      occurrence("occurrence-cancelled", ScheduledOccurrenceStatus.CANCELLED, "2026-08-09T05:00:00.000Z"),
      occurrence("occurrence-future", ScheduledOccurrenceStatus.PENDING, "2026-08-20T00:00:00.000Z"),
    ],
  });

  const scheduledOccurrences = repositories.scheduledOccurrences!;
  const result = await scheduledOccurrences.listForCreatorScan(
    world.id,
    "2026-08-10T00:00:00.000Z",
    10,
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ["occurrence-pending", "occurrence-failed", "occurrence-running"],
  );
});

test("in-memory dispatch repository allows retries for one occurrence and rejects idempotency conflicts", async () => {
  const first = dispatch("dispatch-1", "key-1");
  const retry = dispatch("dispatch-2", "key-2");
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [
      occurrence("occurrence-pending", ScheduledOccurrenceStatus.PENDING, "2026-08-09T01:00:00.000Z"),
    ],
    dispatchRequests: [first],
  });

  const dispatchRequests = repositories.dispatchRequests!;
  await dispatchRequests.save(retry);
  assert.equal((await dispatchRequests.listByBatch("batch-1")).length, 2);
  await assert.rejects(
    dispatchRequests.save({
      ...first,
      payload: { occurrenceId: "different" },
    }),
    /idempotency key conflict/i,
  );

  await dispatchRequests.recordFailure(first.id, "redis down");
  const stored = await dispatchRequests.getById(first.id);
  assert.equal(stored?.status, "PENDING");
  assert.equal(stored?.attempts, 1);
  assert.equal(stored?.lastError, "redis down");
});

class TransactionClient implements SqlClient {
  public transactionCalls = 0;

  async query<Row extends SqlRow = SqlRow>(): Promise<SqlQueryResult<Row>> {
    return { rows: [] };
  }

  async transaction<T>(operation: (client: SqlClient) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    return operation(this);
  }
}

test("SQL transaction repositories include dispatch requests", async () => {
  const client = new TransactionClient();
  const repositories = createSqlRepositories(client);
  await repositories.transaction(async (transaction) => {
    assert.ok(transaction.dispatchRequests);
  });
  assert.equal(client.transactionCalls, 1);
});

// --- SQL dispatch repository tests ---
const sampleRow: SqlRow = {
  id: "d1",
  batch_id: "b1",
  candidate_id: "c1",
  action: "EXECUTE_EXISTING",
  idempotency_key: "ik1",
  story_world_id: world.id,
  occurrence_id: "occ1",
  payload: { occurrenceId: "occ1", execution: { ruleVersion: "v1" } },
  status: "PENDING",
  attempts: 0,
  requested_at: new Date("2026-08-09T00:00:00.000Z"),
  enqueued_at: null,
  last_error: null,
};
const sampleRowWithOptionals: SqlRow = {
  ...sampleRow,
  id: "d2",
  idempotency_key: "ik2",
  status: "ENQUEUED",
  attempts: 3,
  enqueued_at: new Date("2026-08-09T01:00:00.000Z"),
  last_error: "timeout",
};

function mockClient(rows: SqlRow[] = []): SqlClient & { queries: Array<{ sql: string; params: unknown[] }> } {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  return {
    queries,
    async query<Row extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<Row>> {
      queries.push({ sql, params });
      if (sql.includes("ON CONFLICT (idempotency_key) DO NOTHING")) {
        // INSERT returning row
        return { rows: [rows[0] as Row] };
      }
      if (sql.includes("WHERE idempotency_key")) {
        return { rows: [rows[0] as Row] };
      }
      return { rows: rows as Row[] };
    },
    async transaction<T>(operation: (client: SqlClient) => Promise<T>): Promise<T> {
      return operation(this);
    },
  };
}

test("SQL dispatch getById maps rows and handles missing", async () => {
  const { createSqlDispatchRequestRepository } = await import("./dispatch.ts");
  const repo = createSqlDispatchRequestRepository(mockClient([sampleRow]));
  const result = await repo.getById("d1");
  assert.ok(result);
  assert.equal(result.id, "d1");
  assert.equal(result.batchId, "b1");
  assert.equal(result.status, "PENDING");
  assert.equal(result.attempts, 0);
  assert.ok(!("enqueuedAt" in result));
  assert.ok(!("lastError" in result));

  const empty = createSqlDispatchRequestRepository(mockClient([]));
  assert.equal(await empty.getById("missing"), undefined);
});

test("SQL dispatch getById maps optional fields when present", async () => {
  const { createSqlDispatchRequestRepository } = await import("./dispatch.ts");
  const repo = createSqlDispatchRequestRepository(mockClient([sampleRowWithOptionals]));
  const result = await repo.getById("d2");
  assert.ok(result);
  assert.equal(result.status, "ENQUEUED");
  assert.equal(result.attempts, 3);
  assert.equal(result.enqueuedAt, "2026-08-09T01:00:00.000Z");
  assert.equal(result.lastError, "timeout");
});

test("SQL dispatch listByBatch and listPending map rows", async () => {
  const { createSqlDispatchRequestRepository } = await import("./dispatch.ts");
  const repo = createSqlDispatchRequestRepository(mockClient([sampleRow, sampleRowWithOptionals]));
  const batch = await repo.listByBatch("b1");
  assert.equal(batch.length, 2);
  assert.equal(batch[0].id, "d1");

  const pending = await repo.listPending(5);
  assert.equal(pending.length, 2);
});

test("SQL dispatch listPending rejects invalid limit", async () => {
  const { createSqlDispatchRequestRepository } = await import("./dispatch.ts");
  const repo = createSqlDispatchRequestRepository(mockClient());
  await assert.rejects(repo.listPending(0), RangeError);
  await assert.rejects(repo.listPending(-1), RangeError);
  await assert.rejects(repo.listPending(1.5), RangeError);
});

test("SQL dispatch save returns inserted row and replays on conflict with same intent", async () => {
  const { createSqlDispatchRequestRepository } = await import("./dispatch.ts");
  const req = dispatch("d1", "ik1");
  const repo = createSqlDispatchRequestRepository(mockClient([sampleRow]));
  const result = await repo.save(req);
  assert.equal(result.id, "d1");
  assert.equal(result.status, "PENDING");
});

test("SQL dispatch save rejects idempotency conflict with different intent", async () => {
  const { createSqlDispatchRequestRepository } = await import("./dispatch.ts");
  const conflictingRow: SqlRow = { ...sampleRow, payload: { occurrenceId: "other", execution: {} } };
  const client = mockClient([conflictingRow]);
  // First call returns inserted, second returns existing with different payload
  let callCount = 0;
  const originalQuery = client.query.bind(client);
  client.query = async <Row extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<Row>> => {
    callCount++;
    if (sql.includes("ON CONFLICT (idempotency_key) DO NOTHING") && callCount === 1) {
      return { rows: [] as unknown as Row[] }; // No row inserted = conflict
    }
    return originalQuery(sql, params) as Promise<SqlQueryResult<Row>>;
  };
  const repo = createSqlDispatchRequestRepository(client);
  const req = dispatch("d1", "ik1");
  await assert.rejects(repo.save(req), /idempotency key conflict|different intent/i);
});

test("SQL dispatch save throws when replay cannot be resolved", async () => {
  const { createSqlDispatchRequestRepository } = await import("./dispatch.ts");
  const client = mockClient([]);
  let callCount = 0;
  client.query = async <Row extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<Row>> => {
    callCount++;
    if (sql.includes("ON CONFLICT (idempotency_key) DO NOTHING")) {
      return { rows: [] as unknown as Row[] }; // No row inserted
    }
    if (sql.includes("WHERE idempotency_key")) {
      return { rows: [] as unknown as Row[] }; // Not found
    }
    return { rows: [] as unknown as Row[] };
  };
  const repo = createSqlDispatchRequestRepository(client);
  await assert.rejects(repo.save(dispatch("d1", "ik1")), /could not be resolved/);
});

test("SQL dispatch mapRequest throws on invalid payload", async () => {
  const { createSqlDispatchRequestRepository } = await import("./dispatch.ts");
  const badRows: SqlRow[] = [
    { ...sampleRow, payload: null },
    { ...sampleRow, payload: "string" },
    { ...sampleRow, payload: [1, 2] },
  ];
  for (const badRow of badRows) {
    const repo = createSqlDispatchRequestRepository(mockClient([badRow]));
    await assert.rejects(repo.getById("d1"), TypeError);
  }
});

test("SQL dispatch heartbeat and getHeartbeat round-trip", async () => {
  const { createSqlDispatchRequestRepository } = await import("./dispatch.ts");
  const heartbeatRow: SqlRow = {
    worker_id: "w1",
    status: "RUNNING",
    heartbeat_at: new Date("2026-08-09T00:00:00.000Z"),
    metadata: { cpu: 42 },
  };
  const repo = createSqlDispatchRequestRepository(mockClient([heartbeatRow]));
  await repo.heartbeat({ workerId: "w1", status: "RUNNING", heartbeatAt: "2026-08-09T00:00:00.000Z", metadata: { cpu: 42 } });
  const result = await repo.getHeartbeat("w1");
  assert.ok(result);
  assert.equal(result.workerId, "w1");
  assert.equal(result.status, "RUNNING");
  assert.deepEqual(result.metadata, { cpu: 42 });

  const emptyRepo = createSqlDispatchRequestRepository(mockClient([]));
  assert.equal(await emptyRepo.getHeartbeat("missing"), undefined);
});

test("SQL dispatch getHeartbeat throws on invalid metadata", async () => {
  const { createSqlDispatchRequestRepository } = await import("./dispatch.ts");
  const badMeta: SqlRow = { worker_id: "w1", status: "RUNNING", heartbeat_at: new Date(), metadata: "not-object" };
  const repo = createSqlDispatchRequestRepository(mockClient([badMeta]));
  await assert.rejects(repo.getHeartbeat("w1"), TypeError);
});
