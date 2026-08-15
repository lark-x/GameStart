import assert from "node:assert/strict";
import test from "node:test";

import { validateRegistry } from "./governance-lib.mjs";
import { discoverTaskManifest, validateTaskScope } from "./check-task-scope.mjs";

function registry() {
  return {
    schemaVersion: 1,
    unownedPolicy: "deny",
    activeRuntimePaths: ["src/**"],
    legacyReadOnlyRoots: ["legacy/**"],
    delegatedPaths: ["docs/interface-requests/**"],
    protectedPaths: ["shared/**", "docs/**"],
    highRiskPaths: ["shared/migrations/**"],
    modules: {
      core: { allowedDependencies: ["core", "integration"], ownedPaths: ["src/core/**"] },
      platform: { allowedDependencies: ["platform", "integration"], ownedPaths: ["src/platform/**"] },
      integration: { allowedDependencies: ["core", "platform", "integration"], ownedPaths: ["shared/**", "docs/**"] },
    },
  };
}

function task(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "20260815-core-example",
    title: "Example",
    module: "core",
    risk: "medium",
    changeClass: "normal",
    status: "approved",
    userOutcome: "Example outcome",
    allowedPaths: ["docs/tasks/20260815-core-example.json", "src/core/feature.ts"],
    forbiddenPaths: [],
    nonGoals: [],
    interfaceRequests: [],
    acceptanceCommands: ["pnpm test"],
    approval: { required: true, confirmed: true, reference: "user confirmation" },
    delivery: { branch: "codex/core/example", baseSha: "1234567", pullRequest: null, commits: [], results: [] },
    ...overrides,
  };
}

const taskPath = "docs/tasks/20260815-core-example.json";

test("allows an explicitly authorized module file", () => {
  const errors = validateTaskScope({
    registry: registry(), task: task(), taskPath, changedFiles: [taskPath, "src/core/feature.ts"],
  });
  assert.deepEqual(errors, []);
});

test("rejects an unlisted file in the same module", () => {
  const errors = validateTaskScope({
    registry: registry(), task: task(), taskPath, changedFiles: [taskPath, "src/core/other.ts"],
  });
  assert.ok(errors.some((error) => error.includes("outside task allowedPaths")));
});

test("rejects a file owned by another module", () => {
  const errors = validateTaskScope({
    registry: registry(),
    task: task({ allowedPaths: [taskPath, "src/platform/feature.ts"] }),
    taskPath,
    changedFiles: [taskPath, "src/platform/feature.ts"],
  });
  assert.ok(errors.some((error) => error.includes("outside module core")));
  assert.ok(errors.some((error) => error.includes("belongs to platform")));
});

test("rejects protected files in a feature task", () => {
  const errors = validateTaskScope({
    registry: registry(),
    task: task({ allowedPaths: [taskPath, "shared/config.ts"] }),
    taskPath,
    changedFiles: [taskPath, "shared/config.ts"],
  });
  assert.ok(errors.some((error) => error.includes("protected file")));
});

test("allows exact protected files in a high-risk integration task", () => {
  const integrationTaskPath = "docs/tasks/20260815-integration-example.json";
  const errors = validateTaskScope({
    registry: registry(),
    task: task({
      id: "20260815-integration-example",
      module: "integration",
      risk: "high",
      allowedPaths: [integrationTaskPath, "shared/migrations/0001.ts"],
      delivery: { branch: "codex/integration/example", baseSha: "1234567", pullRequest: null, commits: [], results: [] },
    }),
    taskPath: integrationTaskPath,
    changedFiles: [integrationTaskPath, "shared/migrations/0001.ts"],
  });
  assert.deepEqual(errors, []);
});

test("rejects globs in integration task scope", () => {
  const errors = validateTaskScope({
    registry: registry(),
    task: task({ module: "integration", risk: "high", allowedPaths: ["shared/**"] }),
    taskPath: "docs/tasks/20260815-integration-example.json",
    changedFiles: ["shared/config.ts"],
  });
  assert.ok(errors.some((error) => error.includes("globs are forbidden")));
});

test("detects ownership overlap and missing active ownership", () => {
  const value = registry();
  value.modules.platform.ownedPaths.push("src/core/**");
  const errors = validateRegistry(value, ["src/core/a.ts", "src/unowned.ts"]);
  assert.ok(errors.some((error) => error.includes("multiple modules")));
  assert.ok(errors.some((error) => error.includes("has no module owner")));
});

test("requires exactly one changed task manifest", () => {
  assert.throws(() => discoverTaskManifest([], undefined), /exactly one/);
  assert.throws(
    () => discoverTaskManifest(["docs/tasks/a.json", "docs/tasks/b.json"], undefined),
    /exactly one/,
  );
});

test("requires confirmation for medium and high risk tasks", () => {
  const errors = validateTaskScope({
    registry: registry(),
    task: task({ approval: { required: true, confirmed: false, reference: null } }),
    taskPath,
    changedFiles: [taskPath, "src/core/feature.ts"],
  });
  assert.ok(errors.some((error) => error.includes("confirmed approval")));
});

test("allows an unconfirmed scope-only manifest for a draft plan", () => {
  const errors = validateTaskScope({
    registry: registry(),
    task: task({ status: "planned", approval: { required: true, confirmed: false, reference: null } }),
    taskPath,
    changedFiles: [taskPath],
  });
  assert.deepEqual(errors, []);
});

test("rejects V1 files and explicit forbidden paths", () => {
  const readOnly = validateTaskScope({
    registry: registry(),
    task: task({ allowedPaths: [taskPath, "legacy/old.ts"] }),
    taskPath,
    changedFiles: [taskPath, "legacy/old.ts"],
  });
  assert.ok(readOnly.some((error) => error.includes("V1/read-only")));

  const forbidden = validateTaskScope({
    registry: registry(),
    task: task({ forbiddenPaths: ["src/core/feature.ts"] }),
    taskPath,
    changedFiles: [taskPath, "src/core/feature.ts"],
  });
  assert.ok(forbidden.some((error) => error.includes("forbiddenPaths")));
});

test("permits only an exact delegated interface request", () => {
  const requestPath = "docs/interface-requests/20260815-core-example.md";
  const errors = validateTaskScope({
    registry: registry(),
    task: task({
      status: "planned",
      allowedPaths: [taskPath, requestPath],
      approval: { required: true, confirmed: false, reference: null },
    }),
    taskPath,
    changedFiles: [taskPath, requestPath],
  });
  assert.deepEqual(errors, []);
});

test("checks branch module and manifest identity", () => {
  const errors = validateTaskScope({
    registry: registry(),
    task: task(),
    taskPath: "docs/tasks/wrong.json",
    changedFiles: ["docs/tasks/wrong.json"],
    branchName: "codex/platform/wrong",
  });
  assert.ok(errors.some((error) => error.includes("filename must match")));
  assert.ok(errors.some((error) => error.includes("does not match")));
  assert.ok(errors.some((error) => error.includes("codex/core/")));
});
