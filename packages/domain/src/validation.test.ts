import assert from "node:assert/strict";
import test from "node:test";

import {
  assertIsoDate,
  assertIsoTimestamp,
  assertNonEmptyString,
  assertTimezone,
} from "./validation.ts";

test("validation helpers accept canonical values and reject malformed values", () => {
  assert.doesNotThrow(() => assertNonEmptyString("value", "field"));
  assert.doesNotThrow(() => assertTimezone("Asia/Shanghai", "timezone"));
  assert.doesNotThrow(() => assertIsoDate("2026-02-28", "date"));
  assert.doesNotThrow(() => assertIsoTimestamp("2026-08-05T00:00:00.000Z", "timestamp"));

  for (const value of [undefined, null, 1, "", "  "]) {
    assert.throws(() => assertNonEmptyString(value, "field"), /field must be a non-empty string/);
  }
  assert.throws(() => assertTimezone("Not/AZone", "timezone"), /valid IANA timezone/);
  assert.throws(() => assertIsoDate("2026/02/28", "date"), /YYYY-MM-DD/);
  assert.throws(() => assertIsoDate("2026-02-30", "date"), /valid calendar date/);
  assert.throws(() => assertIsoTimestamp("not-a-timestamp", "timestamp"), /valid ISO timestamp/);
});
