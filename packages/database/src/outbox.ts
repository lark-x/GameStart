import type { SqlClient, SqlRow } from "./sql.ts";

export type {
  OutboxEvent,
  OutboxEventInput,
  OutboxEventWriteResult,
  OutboxEventRepository,
} from "@living-network/ports";
import type { OutboxEvent, OutboxEventInput, OutboxEventWriteResult, OutboxEventRepository } from "@living-network/ports";
import type { JsonObject } from "@living-network/domain";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

function requiredTimestamp(value: unknown, field: string): string {
  if (value instanceof Date) return value.toISOString();
  return requiredString(value, field);
}

function mapOutboxRow(row: SqlRow): OutboxEvent {
  const publishedAt = row.published_at === null || row.published_at === undefined
    ? undefined
    : requiredTimestamp(row.published_at, "outbox_events.published_at");
  const lastError = row.last_error === null || row.last_error === undefined
    ? undefined
    : requiredString(row.last_error, "outbox_events.last_error");
  const payload = row.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("outbox_events.payload must be an object");
  }
  const value: OutboxEvent = {
    id: requiredString(row.id, "outbox_events.id"),
    aggregateType: requiredString(row.aggregate_type, "outbox_events.aggregate_type"),
    aggregateId: requiredString(row.aggregate_id, "outbox_events.aggregate_id"),
    eventType: requiredString(row.event_type, "outbox_events.event_type"),
    payload: payload as JsonObject,
    idempotencyKey: requiredString(row.idempotency_key, "outbox_events.idempotency_key"),
    createdAt: requiredTimestamp(row.created_at, "outbox_events.created_at"),
    attempts: Number(row.attempts),
    ...(publishedAt === undefined ? {} : { publishedAt }),
    ...(lastError === undefined ? {} : { lastError }),
  };
  if (!Number.isSafeInteger(value.attempts) || value.attempts < 0) {
    throw new TypeError("outbox_events.attempts must be a non-negative integer");
  }
  return value;
}

const OUTBOX_SELECT = `
  SELECT id, aggregate_type, aggregate_id, event_type, payload,
         idempotency_key, created_at, published_at, attempts, last_error
  FROM outbox_events`;

export class SqlOutboxEventRepository implements OutboxEventRepository {
  private readonly client: SqlClient;

  public constructor(client: SqlClient) {
    this.client = client;
  }

  public async append(input: OutboxEventInput): Promise<OutboxEventWriteResult> {
    const inserted = await this.client.query(
      `INSERT INTO outbox_events (
         id, aggregate_type, aggregate_id, event_type, payload,
         idempotency_key, created_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, aggregate_type, aggregate_id, event_type, payload,
                 idempotency_key, created_at, published_at, attempts, last_error`,
      [
        input.id,
        input.aggregateType,
        input.aggregateId,
        input.eventType,
        JSON.stringify(input.payload),
        input.idempotencyKey,
        input.createdAt,
      ],
    );
    const row = inserted.rows[0];
    if (row) return { event: mapOutboxRow(row), inserted: true };
    const existing = await this.client.query(
      `${OUTBOX_SELECT} WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    const existingRow = existing.rows[0];
    if (!existingRow) throw new TypeError("Outbox idempotency lookup returned no row");
    const event = mapOutboxRow(existingRow);
    if (
      event.aggregateType !== input.aggregateType ||
      event.aggregateId !== input.aggregateId ||
      event.eventType !== input.eventType ||
      JSON.stringify(event.payload) !== JSON.stringify(input.payload)
    ) {
      throw new TypeError(`Outbox idempotency key conflict: ${input.idempotencyKey}`);
    }
    return { event, inserted: false };
  }

  public async listUnpublished(limit: number): Promise<readonly OutboxEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new RangeError("outbox limit must be an integer between 1 and 1000");
    }
    const result = await this.client.query(
      `${OUTBOX_SELECT}
       WHERE published_at IS NULL
       ORDER BY created_at, id
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(mapOutboxRow);
  }

  public async markPublished(id: string, publishedAt: string): Promise<OutboxEvent> {
    const result = await this.client.query(
      `${OUTBOX_SELECT}
       WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new TypeError(`Unknown outbox event: ${id}`);
    await this.client.query(
      "UPDATE outbox_events SET published_at = $2, last_error = NULL WHERE id = $1",
      [id, publishedAt],
    );
    const current = mapOutboxRow(row);
    const { lastError: _lastError, ...withoutError } = current;
    return { ...withoutError, publishedAt };
  }

  public async markFailed(id: string, error: string): Promise<OutboxEvent> {
    if (error.trim().length === 0) throw new TypeError("outbox error must not be empty");
    const result = await this.client.query(
      `${OUTBOX_SELECT}
       WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new TypeError(`Unknown outbox event: ${id}`);
    const current = mapOutboxRow(row);
    const attempts = current.attempts + 1;
    await this.client.query(
      "UPDATE outbox_events SET attempts = $2, last_error = $3 WHERE id = $1",
      [id, attempts, error],
    );
    return { ...current, attempts, lastError: error };
  }
}
