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
