import assert from "node:assert/strict";
import test from "node:test";

import {
  FEATURE_FIRST_SCOPE_MESSAGE,
  scopeGovernanceStatus,
} from "./check-task-scope.mjs";

test("keeps task and scope governance disabled during the feature-first phase", () => {
  const status = scopeGovernanceStatus();

  assert.equal(status.enabled, false);
  assert.deepEqual(status.errors, []);
  assert.equal(status.message, FEATURE_FIRST_SCOPE_MESSAGE);
});

test("does not require a task manifest, module branch, or single-module change set", () => {
  const status = scopeGovernanceStatus({
    branchName: "codex/ship-first-working-loop",
    changedFiles: [
      "apps/web/src/v2/feature.ts",
      "apps/api/src/v2/feature.ts",
      "apps/worker/src/v2/feature.ts",
      "packages/database/src/v2/feature.ts",
    ],
  });

  assert.deepEqual(status.errors, []);
});

test("points developers to the separate dependency-boundary gate", () => {
  assert.match(FEATURE_FIRST_SCOPE_MESSAGE, /dependency boundaries remain enforced/i);
});
