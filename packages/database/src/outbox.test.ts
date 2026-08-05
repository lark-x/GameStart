import assert from "node:assert/strict";
import test from "node:test";

import { SqlOutboxEventRepository } from "./outbox.ts";
import type { SqlClient } from "./sql.ts";

test("outbox repository appends idempotently and lists pending events", async () => {
  const rows: Record<string, unknown>[] = [];
  const client = {
    async query(text: string, values: readonly unknown[] = []) {
      if (text.includes("INSERT INTO outbox_events")) {
        const key = values[5];
        if (rows.some((row) => row.idempotency_key === key)) return { rows: [] };
        const row = {
          id: values[0], aggregate_type: values[1], aggregate_id: values[2], event_type: values[3],
          payload: JSON.parse(String(values[4])), idempotency_key: key,
          created_at: values[6], published_at: null, attempts: 0, last_error: null,
        };
        rows.push(row);
        return { rows: [row] };
      }
      if (text.includes("WHERE idempotency_key")) {
        return { rows: rows.filter((row) => row.idempotency_key === values[0]) };
      }
      if (text.includes("WHERE published_at IS NULL")) return { rows };
      return { rows: [] };
    },
  };
  const repository = new SqlOutboxEventRepository(client as unknown as SqlClient);
  const input = {
    id: "outbox-1", aggregateType: "message", aggregateId: "message-1",
    eventType: "message.created", payload: { messageId: "message-1" },
    idempotencyKey: "message-1.created", createdAt: "2026-08-05T00:00:00.000Z",
  } as const;
  assert.equal((await repository.append(input)).inserted, true);
  assert.equal((await repository.append(input)).inserted, false);
  assert.equal((await repository.listUnpublished(10)).length, 1);
  await assert.rejects(
    repository.append({ ...input, payload: { messageId: "different" } }),
    /idempotency key conflict/,
  );
});

test("outbox repository publishes, retries, and validates SQL rows and limits", async () => {
  const row = {
    id: "outbox-row",
    aggregate_type: "message",
    aggregate_id: "message-row",
    event_type: "message.created",
    payload: { value: 1 },
    idempotency_key: "row-key",
    created_at: new Date("2026-08-05T00:00:00.000Z"),
    published_at: new Date("2026-08-05T00:01:00.000Z"),
    attempts: 2,
    last_error: "temporary",
  };
  const statements: string[] = [];
  const client = {
    async query(text: string, values: readonly unknown[] = []) {
      statements.push(text);
      if (text.includes("WHERE id = $1")) return { rows: [row] };
      if (text.includes("WHERE published_at IS NULL")) return { rows: [row] };
      if (text.includes("WHERE idempotency_key")) return { rows: [] };
      if (text.includes("INSERT INTO outbox_events")) return { rows: [] };
      return { rows: [] };
    },
  } as unknown as SqlClient;
  const repository = new SqlOutboxEventRepository(client);
  const published = await repository.markPublished("outbox-row", "2026-08-05T00:02:00.000Z");
  assert.equal(published.publishedAt, "2026-08-05T00:02:00.000Z");
  assert.equal(published.lastError, undefined);
  const failed = await repository.markFailed("outbox-row", "retry later");
  assert.equal(failed.attempts, 3);
  assert.equal(failed.lastError, "retry later");
  assert.equal((await repository.listUnpublished(10)).length, 1);
  await assert.rejects(repository.listUnpublished(0), /outbox limit/);
  await assert.rejects(repository.listUnpublished(1001), /outbox limit/);
  await assert.rejects(repository.markFailed("outbox-row", "  "), /must not be empty/);
  assert.ok(statements.some((statement) => statement.includes("UPDATE outbox_events")));
});

test("outbox repository reports missing idempotency rows, events, and malformed rows", async () => {
  const client = {
    async query(text: string) {
      if (text.includes("INSERT INTO outbox_events")) return { rows: [] };
      if (text.includes("WHERE idempotency_key")) return { rows: [] };
      if (text.includes("WHERE id = $1")) return { rows: [] };
      return { rows: [{
        id: "bad",
        aggregate_type: "aggregate",
        aggregate_id: "id",
        event_type: "event",
        payload: [],
        idempotency_key: "key",
        created_at: "2026-08-05T00:00:00.000Z",
        attempts: 0,
      }] };
    },
  } as unknown as SqlClient;
  const repository = new SqlOutboxEventRepository(client);
  const input = {
    id: "outbox-missing",
    aggregateType: "aggregate",
    aggregateId: "id",
    eventType: "event",
    payload: {},
    idempotencyKey: "key",
    createdAt: "2026-08-05T00:00:00.000Z",
  };
  await assert.rejects(repository.append(input), /lookup returned no row/);
  await assert.rejects(repository.markPublished("missing", input.createdAt), /Unknown outbox event/);
  await assert.rejects(repository.markFailed("missing", "error"), /Unknown outbox event/);
  await assert.rejects(repository.listUnpublished(1), /payload must be an object/);
  const malformedString = new SqlOutboxEventRepository({
    async query() {
      return { rows: [{
        id: " ",
        aggregate_type: "aggregate",
        aggregate_id: "id",
        event_type: "event",
        payload: {},
        idempotency_key: "key",
        created_at: "2026-08-05T00:00:00.000Z",
        attempts: 0,
      }] };
    },
  } as unknown as SqlClient);
  await assert.rejects(malformedString.listUnpublished(1), /non-empty string/);
  const malformedAttempts = new SqlOutboxEventRepository({
    async query() {
      return { rows: [{
        id: "outbox-bad-attempts",
        aggregate_type: "aggregate",
        aggregate_id: "id",
        event_type: "event",
        payload: {},
        idempotency_key: "key",
        created_at: "2026-08-05T00:00:00.000Z",
        attempts: -1,
      }] };
    },
  } as unknown as SqlClient);
  await assert.rejects(malformedAttempts.listUnpublished(1), /non-negative integer/);
});
