import assert from "node:assert/strict";
import test from "node:test";

import {
  assertV2GenerationJobTransition,
  shouldRetryV2GenerationJob,
} from "./job.ts";

test("V2 generation job transitions allow queued claim and terminal success", () => {
  assert.equal(assertV2GenerationJobTransition("queued", "claimed"), "claimed");
  assert.equal(assertV2GenerationJobTransition("claimed", "running"), "running");
  assert.equal(assertV2GenerationJobTransition("running", "succeeded"), "succeeded");
  assert.throws(() => assertV2GenerationJobTransition("succeeded", "running"), /Cannot transition/);
});

test("V2 generation job retry guard respects retryability and attempt limits", () => {
  assert.equal(shouldRetryV2GenerationJob({ attempts: 1, maxAttempts: 3, retryable: true }), true);
  assert.equal(shouldRetryV2GenerationJob({ attempts: 3, maxAttempts: 3, retryable: true }), false);
  assert.equal(shouldRetryV2GenerationJob({ attempts: 1, maxAttempts: 3, retryable: false }), false);
  assert.throws(() => shouldRetryV2GenerationJob({ attempts: -1, maxAttempts: 3, retryable: true }), /attempts/);
});
