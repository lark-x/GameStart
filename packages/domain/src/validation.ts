export function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

export function assertTimezone(value: unknown, field: string): asserts value is string {
  assertNonEmptyString(value, field);

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw new TypeError(`${field} must be a valid IANA timezone`);
  }
}

export function assertIsoDate(value: unknown, field: string): asserts value is string {
  assertNonEmptyString(value, field);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${field} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${field} must be a valid calendar date`);
  }
}

export function assertIsoTimestamp(value: unknown, field: string): asserts value is string {
  assertNonEmptyString(value, field);

  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid ISO timestamp`);
  }
}
