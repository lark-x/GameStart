import assert from "node:assert/strict";
import test from "node:test";

import { v2WorkerNamespace } from "./index.ts";

test("V2 worker sentinel discovers the reserved worker namespace", () => {
  assert.equal(v2WorkerNamespace, "living-network-v2-worker");
});
