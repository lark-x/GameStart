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