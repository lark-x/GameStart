import assert from "node:assert/strict";
import test from "node:test";
import { InteractionLogCategory, InteractionLogLevel, InteractionLogSource, type InteractionLogDto, type InteractionLogQuery } from "@living-network/contracts";
import { InMemoryInteractionLogRepository, SqlInteractionLogRepository, encodeInteractionLogCursor, previewMessage, redactSensitive } from "./interaction-log.ts";
import type { SqlClient, SqlQueryResult, SqlRow } from "./sql.ts";

function base(id: string, createdAt: string, extra: Partial<InteractionLogDto> = {}): InteractionLogDto { return { id, createdAt, level: "INFO", source: "API", category: "CHAT", action: "send", outcome: "ok", message: "hello", ...extra }; }

test("in-memory logs sort stably, paginate without gaps, and filter", async () => {
  const repository = new InMemoryInteractionLogRepository([base("a", "2026-01-01T00:00:00.000Z"), base("c", "2026-01-01T00:00:00.000Z", { level: "ERROR", source: "PROVIDER", category: "PROVIDER", correlationId: "corr", requestId: "req", worldId: "w", conversationId: "conv", message: "needle" }), base("b", "2026-01-01T00:00:00.000Z")]);
  const first = await repository.query({ limit: 2 });
  assert.deepEqual(first.items.map((item) => item.id), ["c", "b"]);
  assert.ok(first.nextCursor);
  const second = await repository.query({ limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((item) => item.id), ["a"]);
  assert.equal(second.nextCursor, undefined);
  assert.equal((await repository.query({ limit: 999 })).items.length, 3);
  const query: InteractionLogQuery = { level: "ERROR", source: "PROVIDER", category: "PROVIDER", correlationId: "corr", requestId: "req", worldId: "w", conversationId: "conv", query: "needle", createdAfter: "2025-12-31T00:00:00.000Z", createdBefore: "2026-01-02T00:00:00.000Z" };
  assert.deepEqual((await repository.query(query)).items.map((item) => item.id), ["c"]);
});

test("cleanup removes strictly older rows and keeps boundary", async () => { const cutoff = new Date("2026-01-08T00:00:00.000Z"); const repository = new InMemoryInteractionLogRepository([base("old", "2026-01-07T23:59:59.999Z"), base("edge", cutoff.toISOString())]); assert.equal(await repository.deleteOlderThan(cutoff), 1); });
test("preview and redaction protect secrets and unsafe values", () => { const sentinel = "SENTINEL_SECRET_123"; const value: Record<string, unknown> = { Authorization: sentinel, Cookie: sentinel, "Set-Cookie": sentinel, apiKey: sentinel, token: sentinel, password: sentinel, secret: sentinel, cipher: sentinel, encrypted: sentinel, nested: [{ token: sentinel }], big: 1n }; value.self = value; Object.defineProperty(value, "boom", { enumerable: true, get() { throw new Error("x"); } }); const output = redactSensitive(value); assert.equal(JSON.stringify(output).includes(sentinel), false); assert.equal(previewMessage("x".repeat(500))?.length, 500); assert.equal(previewMessage("x".repeat(501))?.length, 500); });

test("SQL query is parameterized and maps rows", async () => { const calls: Array<{ text: string; values?: readonly unknown[] }> = []; const client: SqlClient = { async query<Row extends SqlRow>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>> { calls.push(values === undefined ? { text } : { text, values }); if (text.startsWith("SELECT")) return { rows: [{ id: "x", created_at: "2026-01-01T00:00:00.000Z", level: "INFO", source: "API", category: "CHAT", action: "send", outcome: "ok", duration_ms: "3", request_id: "r", correlation_id: "c", details: { ok: true } }] as unknown as readonly Row[] }; return { rows: [{ id: "x" }] as unknown as readonly Row[] }; } }; const repository = new SqlInteractionLogRepository(client); await repository.append(base("x", "2026-01-01T00:00:00.000Z")); const page = await repository.query({ limit: 999, cursor: encodeInteractionLogCursor("2026-01-01T00:00:00.000Z", "z"), requestId: "r", query: "hi" }); assert.equal(page.items[0]!.durationMs, 3); assert.match(calls[1]!.text, /ILIKE/); assert.ok(calls[1]!.values?.includes("%hi%")); assert.match(calls[1]!.text, /\(created_at, id\) </); assert.equal(calls[1]!.values?.at(-1), 201); assert.equal(page.nextCursor, undefined); await repository.deleteOlderThan(new Date("2026-01-08T00:00:00.000Z")); });

test("invalid cursor, dates, and SQL enum rows are rejected", async () => { const repository = new InMemoryInteractionLogRepository([base("x", "2026-01-01T00:00:00.000Z")]); await assert.rejects(() => repository.query({ cursor: "bad" }), /Invalid interaction log cursor/); await assert.rejects(() => repository.query({ createdAfter: "bad" }), /createdAfter/); await assert.rejects(() => repository.deleteOlderThan(new Date("bad")), /cutoff/); });

