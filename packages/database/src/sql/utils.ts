export type SqlRow = Record<string, unknown>;

export interface SqlQueryResult<Row extends SqlRow = SqlRow> {
  readonly rows: readonly Row[];
}

export interface SqlClient {
  query<Row extends SqlRow = SqlRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`Database row ${field} must be a non-empty string`);
  }
  return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return requiredString(value, field);
}

export function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`Database row ${field} must be a boolean`);
  }
  return value;
}

export function requiredNumber(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`Database row ${field} must be a finite number`);
  }
  return number;
}

export function optionalDate(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return requiredString(value, field).slice(0, 10);
}

export function requiredTimestamp(value: unknown, field: string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return requiredString(value, field);
}

export function optionalTimestamp(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  return requiredTimestamp(value, field);
}

export function requiredLocalTime(value: unknown, field: string): string {
  return requiredString(value, field).slice(0, 5);
}

export function stringArray(value: unknown, field: string): readonly string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return [...value];
  }
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    const inner = value.slice(1, -1).trim();
    return inner.length === 0 ? [] : inner.split(",").map((item) => item.replace(/^"|"$/g, ""));
  }
  throw new TypeError(`Database row ${field} must be a string array`);
}

export function optionalStringArray(value: unknown, field: string): readonly string[] | undefined {
  if (value === null || value === undefined) return undefined;
  return stringArray(value, field);
}

export function jsonObject(value: unknown, field: string): Record<string, unknown> {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new TypeError(`Database row ${field} must contain valid JSON`);
    }
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError(`Database row ${field} must contain a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export function jsonArray(value: unknown, field: string): readonly unknown[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new TypeError(`Database row ${field} must contain valid JSON`);
    }
  }
  if (!Array.isArray(parsed)) {
    throw new TypeError(`Database row ${field} must contain a JSON array`);
  }
  return parsed;
}
