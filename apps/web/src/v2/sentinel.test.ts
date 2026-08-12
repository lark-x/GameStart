import assert from "node:assert/strict";
import test from "node:test";

import { v2Routes } from "./index.ts";

test("V2 web sentinel exposes the single bootstrap route", () => {
  assert.equal(v2Routes.length, 1);
  assert.equal(v2Routes[0]?.path, "/v2");
  assert.equal(v2Routes[0]?.meta?.v2Shell, true);
});
