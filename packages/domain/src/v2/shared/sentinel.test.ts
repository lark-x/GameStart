import assert from "node:assert/strict";
import test from "node:test";

import { assertV2ReviewTransition, V2DomainError } from "./index.ts";

test("V2 domain sentinel discovers shared candidate review rules", () => {
  assert.equal(assertV2ReviewTransition("pending", "approve"), "approved");
  assert.throws(
    () => assertV2ReviewTransition("approved", "reject"),
    (error) => error instanceof V2DomainError && error.code === "INVALID_CANDIDATE_TRANSITION",
  );
});
