import assert from "node:assert/strict";
import test from "node:test";

import { moduleDependencyViolation, packageRestrictionViolation } from "./check-boundaries.mjs";

const registry = {
  legacyReadOnlyRoots: [],
  delegatedPaths: [],
  modules: {
    core: { allowedDependencies: ["core", "integration"], ownedPaths: ["src/core/**"] },
    platform: { allowedDependencies: ["platform", "integration"], ownedPaths: ["src/platform/**"] },
    integration: { allowedDependencies: ["core", "platform", "integration"], ownedPaths: ["src/shared/**"] },
  },
};

test("package restrictions include package subpath exports", () => {
  assert.match(
    packageRestrictionViolation("packages/domain/src/v2/core/a.ts", "@living-network/ports/v2"),
    /must not depend/,
  );
  assert.equal(
    packageRestrictionViolation("packages/domain/src/v2/core/a.ts", "@living-network/contracts/v2"),
    undefined,
  );
});

test("module dependencies reject direct feature-to-feature imports", () => {
  assert.equal(
    moduleDependencyViolation(registry, "src/core/a.ts", "src/platform/b.ts"),
    "core must not depend on platform",
  );
  assert.equal(moduleDependencyViolation(registry, "src/core/a.ts", "src/shared/b.ts"), undefined);
});
