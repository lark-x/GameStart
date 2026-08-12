import type { InteractionLogDto, InteractionLogPageDto, InteractionLogQuery } from "@living-network/contracts";

export type InteractionLogInput = Omit<InteractionLogDto, "id" | "createdAt"> & { id?: string; createdAt?: string };

export interface InteractionLogRepository {
  append(input: InteractionLogInput): Promise<InteractionLogDto>;
  query(query?: InteractionLogQuery): Promise<InteractionLogPageDto>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}

const SENSITIVE_KEY = /api[-_ ]?key|authorization|cookie|set-cookie|secret|token|password|cipher|encrypted/i;
const CURSOR_PREFIX = "v1.";
type CursorValue = { createdAt: string; id: string };

export function encodeInteractionLogCursor(createdAt: string, id: string): string {
  return CURSOR_PREFIX + Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}

export function decodeInteractionLogCursor(cursor: string): { createdAt: string; id: string } {
  if (typeof cursor !== "string" || !cursor.startsWith(CURSOR_PREFIX)) throw new TypeError("Invalid interaction log cursor");
  try {
    const value = JSON.parse(Buffer.from(cursor.slice(CURSOR_PREFIX.length), "base64url").toString("utf8")) as unknown;
    if (!value || typeof value !== "object" || typeof (value as CursorValue).createdAt !== "string" || typeof (value as CursorValue).id !== "string") throw new Error();
    if (Number.isNaN(Date.parse((value as CursorValue).createdAt)) || (value as CursorValue).id.length === 0) throw new Error();
    return value as CursorValue;
  } catch { throw new TypeError("Invalid interaction log cursor"); }
}

export function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return typeof value === "bigint" ? String(value) : value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    try { for (let i = 0; i < value.length; i += 1) { try { result.push(redactSensitive(value[i], seen)); } catch { result.push("[Unserializable]"); } } } catch { return "[Unserializable]"; }
    return result;
  }
  const result: Record<string, unknown> = {};
  let keys: string[];
  try { keys = Object.keys(value); } catch { return "[Unserializable]"; }
  for (const key of keys) { try { result[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive((value as Record<string, unknown>)[key], seen); } catch { result[key] = "[Unserializable]"; } }
  return result;
}

export function previewMessage(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const text = typeof value === "string" ? value : JSON.stringify(redactSensitive(value)) ?? String(value);
    return text.slice(0, 500);
  } catch { return "[Unserializable]"; }
}
