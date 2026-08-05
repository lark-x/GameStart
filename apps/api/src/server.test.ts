import assert from "node:assert/strict";
import test from "node:test";

import { resolveCorsOrigin } from "./server.ts";

test("CORS only reflects explicitly configured origins", () => {
  const allowed = ["http://localhost:4173", "https://dev.example"];
  assert.equal(resolveCorsOrigin("http://localhost:4173", allowed), "http://localhost:4173");
  assert.equal(resolveCorsOrigin("https://dev.example", allowed), "https://dev.example");
  assert.equal(resolveCorsOrigin("http://evil.example", allowed), undefined);
  assert.equal(resolveCorsOrigin(undefined, allowed), undefined);
});
