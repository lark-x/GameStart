import { isDeepStrictEqual } from "node:util";

import type { SqlClient, SqlRow } from "./sql.ts";

export type DispatchRequestStatus = "PENDING" | "ENQUEUED";

export interface ExecutionDispatchRequest<
  Payload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly batchId: string;
  readonly candidateId: string;
  readonly action: string;
  readonly idempotencyKey: string;
  readonly storyWorldId: string;
  readonly occurrenceId: string;
  readonly payload: Payload;
  readonly status: DispatchRequestStatus;
  readonly attempts: number;
  readonly requestedAt: string;
  readonly enqueuedAt?: string;
  readonly lastError?: string;
}

export interface WorkerHeartbeat {
  readonly workerId: string;
  readonly status: "RUNNING" | "STOPPED";
  readonly heartbeatAt: string;
  readonly metadata: Record<string, unknown>;
}

export interface DispatchRequestRepository<
  Payload extends Record<string, unknown> = Record<string, unknown>,
> {
  getById(id: string): Promise<ExecutionDispatchRequest<Payload> | undefined>;
  listByBatch(batchId: string): Promise<readonly ExecutionDispatchRequest<Payload>[]>;
  listPending(limit: number): Promise<readonly ExecutionDispatchRequest<Payload>[]>;
  save(request: ExecutionDispatchRequest<Payload>): Promise<ExecutionDispatchRequest<Payload>>;
  markEnqueued(id: string, at: string): Promise<void>;
  recordFailure(id: string, error: string): Promise<void>;
  heartbeat(value: WorkerHeartbeat): Promise<void>;
  getHeartbeat(workerId: string): Promise<WorkerHeartbeat | undefined>;
}

function copyObject<Value extends Record<string, unknown>>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function mapRequest<Payload extends Record<string, unknown>>(
  row: SqlRow,
): ExecutionDispatchRequest<Payload> {
  const payload = row.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Database dispatch payload must be an object");
  }
  const toTimestamp = (value: unknown): string =>
    value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    candidateId: String(row.candidate_id),
    action: String(row.action),
    idempotencyKey: String(row.idempotency_key),
    storyWorldId: String(row.story_world_id),
    occurrenceId: String(row.occurrence_id),
    payload: copyObject(payload as Payload),
    status: String(row.status) as DispatchRequestStatus,
    attempts: Number(row.attempts),
    requestedAt: toTimestamp(row.requested_at),
    ...(row.enqueued_at == null ? {} : { enqueuedAt: toTimestamp(row.enqueued_at) }),
    ...(row.last_error == null ? {} : { lastError: String(row.last_error) }),
  };
}

function assertSameIntent<Payload extends Record<string, unknown>>(
  stored: ExecutionDispatchRequest<Payload>,
  requested: ExecutionDispatchRequest<Payload>,
): void {
  if (
    stored.batchId !== requested.batchId ||
    stored.candidateId !== requested.candidateId ||
    stored.action !== requested.action ||
    stored.storyWorldId !== requested.storyWorldId ||
    stored.occurrenceId !== requested.occurrenceId ||
    !isDeepStrictEqual(stored.payload, requested.payload)
  ) {
    throw new Error(`Dispatch idempotency key conflict: ${requested.idempotencyKey}`);
  }
}

export function createSqlDispatchRequestRepository<
  Payload extends Record<string, unknown> = Record<string, unknown>,
>(client: SqlClient): DispatchRequestRepository<Payload> {
  return {
    async getById(id) {
      const result = await client.query(
        "SELECT * FROM execution_dispatch_requests WHERE id = $1",
        [id],
      );
      return result.rows[0] === undefined ? undefined : mapRequest<Payload>(result.rows[0]);
    },
    async listByBatch(batchId) {
      const result = await client.query(
        "SELECT * FROM execution_dispatch_requests WHERE batch_id = $1 ORDER BY requested_at, id",
        [batchId],
      );
      return result.rows.map((row) => mapRequest<Payload>(row));
    },
    async listPending(limit) {
      if (!Number.isSafeInteger(limit) || limit < 1) {
        throw new RangeError("dispatch limit must be a positive integer");
      }
      const result = await client.query(
        "SELECT * FROM execution_dispatch_requests WHERE status = 'PENDING' ORDER BY requested_at, id LIMIT $1",
        [limit],
      );
      return result.rows.map((row) => mapRequest<Payload>(row));
    },
    async save(request) {
      const inserted = await client.query(
        `INSERT INTO execution_dispatch_requests (
           id, batch_id, candidate_id, action, idempotency_key, story_world_id,
           occurrence_id, payload, status, attempts, requested_at, enqueued_at, last_error
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING *`,
        [
          request.id,
          request.batchId,
          request.candidateId,
          request.action,
          request.idempotencyKey,
          request.storyWorldId,
          request.occurrenceId,
          JSON.stringify(request.payload),
          request.status,
          request.attempts,
          request.requestedAt,
          request.enqueuedAt ?? null,
          request.lastError ?? null,
        ],
      );
      if (inserted.rows[0] !== undefined) return mapRequest<Payload>(inserted.rows[0]);
      const existing = await client.query(
        "SELECT * FROM execution_dispatch_requests WHERE idempotency_key = $1",
        [request.idempotencyKey],
      );
      if (existing.rows[0] === undefined) {
        throw new Error(`Dispatch replay could not be resolved: ${request.idempotencyKey}`);
      }
      const stored = mapRequest<Payload>(existing.rows[0]);
      assertSameIntent(stored, request);
      return stored;
    },
    async markEnqueued(id, at) {
      await client.query(
        "UPDATE execution_dispatch_requests SET status = 'ENQUEUED', enqueued_at = $2, last_error = NULL WHERE id = $1 AND status = 'PENDING'",
        [id, at],
      );
    },
    async recordFailure(id, error) {
      await client.query(
        "UPDATE execution_dispatch_requests SET attempts = attempts + 1, last_error = $2 WHERE id = $1 AND status = 'PENDING'",
        [id, error],
      );
    },
    async heartbeat(value) {
      await client.query(
        `INSERT INTO worker_heartbeats (worker_id, status, heartbeat_at, metadata)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (worker_id) DO UPDATE SET
           status = EXCLUDED.status,
           heartbeat_at = EXCLUDED.heartbeat_at,
           metadata = EXCLUDED.metadata`,
        [value.workerId, value.status, value.heartbeatAt, JSON.stringify(value.metadata)],
      );
    },
    async getHeartbeat(workerId) {
      const result = await client.query(
        "SELECT * FROM worker_heartbeats WHERE worker_id = $1",
        [workerId],
      );
      const row = result.rows[0];
      if (row === undefined) return undefined;
      const metadata = row.metadata;
      if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
        throw new TypeError("Database worker heartbeat metadata must be an object");
      }
      return {
        workerId: String(row.worker_id),
        status: String(row.status) as WorkerHeartbeat["status"],
        heartbeatAt:
          row.heartbeat_at instanceof Date
            ? row.heartbeat_at.toISOString()
            : new Date(String(row.heartbeat_at)).toISOString(),
        metadata: copyObject(metadata as Record<string, unknown>),
      };
    },
  };
}

export function createInMemoryDispatchRequestRepository<
  Payload extends Record<string, unknown> = Record<string, unknown>,
>(seed: readonly ExecutionDispatchRequest<Payload>[] = []): DispatchRequestRepository<Payload> {
  const requests = new Map<string, ExecutionDispatchRequest<Payload>>();
  const idempotencyKeys = new Map<string, string>();
  const heartbeats = new Map<string, WorkerHeartbeat>();

  for (const request of seed) {
    if (requests.has(request.id) || idempotencyKeys.has(request.idempotencyKey)) {
      throw new TypeError(`Duplicate dispatch request: ${request.id}`);
    }
    requests.set(request.id, { ...request, payload: copyObject(request.payload) });
    idempotencyKeys.set(request.idempotencyKey, request.id);
  }

  return {
    async getById(id) {
      const request = requests.get(id);
      return request === undefined
        ? undefined
        : { ...request, payload: copyObject(request.payload) };
    },
    async listByBatch(batchId) {
      return [...requests.values()]
        .filter((request) => request.batchId === batchId)
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id))
        .map((request) => ({ ...request, payload: copyObject(request.payload) }));
    },
    async listPending(limit) {
      if (!Number.isSafeInteger(limit) || limit < 1) {
        throw new RangeError("dispatch limit must be a positive integer");
      }
      return [...requests.values()]
        .filter((request) => request.status === "PENDING")
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((request) => ({ ...request, payload: copyObject(request.payload) }));
    },
    async save(request) {
      const existingId = idempotencyKeys.get(request.idempotencyKey);
      if (existingId !== undefined) {
        const existing = requests.get(existingId)!;
        assertSameIntent(existing, request);
        return { ...existing, payload: copyObject(existing.payload) };
      }
      if (requests.has(request.id)) {
        throw new Error(`Duplicate dispatch request id: ${request.id}`);
      }
      const stored = { ...request, payload: copyObject(request.payload) };
      requests.set(stored.id, stored);
      idempotencyKeys.set(stored.idempotencyKey, stored.id);
      return { ...stored, payload: copyObject(stored.payload) };
    },
    async markEnqueued(id, at) {
      const request = requests.get(id);
      if (request?.status === "PENDING") {
        const { lastError: _lastError, ...rest } = request;
        requests.set(id, { ...rest, status: "ENQUEUED", enqueuedAt: at });
      }
    },
    async recordFailure(id, error) {
      const request = requests.get(id);
      if (request?.status === "PENDING") {
        requests.set(id, {
          ...request,
          attempts: request.attempts + 1,
          lastError: error,
        });
      }
    },
    async heartbeat(value) {
      heartbeats.set(value.workerId, {
        ...value,
        metadata: copyObject(value.metadata),
      });
    },
    async getHeartbeat(workerId) {
      const heartbeat = heartbeats.get(workerId);
      return heartbeat === undefined
        ? undefined
        : { ...heartbeat, metadata: copyObject(heartbeat.metadata) };
    },
  };
}