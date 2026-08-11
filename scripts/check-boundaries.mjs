#!/usr/bin/env node

/**
 * Boundary check script — prevents illegal cross-package imports.
 *
 * Rules:
 * 1. No relative imports crossing package boundaries (../../packages/... or ../../domain/... etc.)
 * 2. domain must not depend on database, api, worker, ai, or ports
 * 3. ports must not depend on database, api, worker, or ai
 * 4. contracts must not depend on database, api, worker, ai, ports, or domain
 * 5. API/Worker must not import source files from other packages using relative paths
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC_DIRS = ["apps", "packages"];

const FORBIDDEN_CROSS_PKG = /\.\.\/\.\.\/(?:packages|domain|database|contracts|ai|config|ports)\//;

const PACKAGE_RESTRICTIONS = {
  "packages/domain/src": ["packages/database", "packages/api", "packages/worker", "packages/ai", "packages/ports"],
  "packages/ports/src": ["packages/database", "packages/api", "packages/worker", "packages/ai"],
  "packages/contracts/src": ["packages/database", "packages/api", "packages/worker", "packages/ai", "packages/ports", "packages/domain"],
};

function walkTs(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
      results.push(...walkTs(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      results.push(full);
    }
  }
  return results;
}

let violations = 0;
let inNewUrlBlock = false;

for (const srcDir of SRC_DIRS) {
  const absDir = join(ROOT, srcDir);
  const files = walkTs(absDir);
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const relFile = relative(ROOT, file);
    const lines = content.split("\n");
    for (const [i, line] of lines.entries()) {
      // Track multi-line new URL(...) blocks
      if (line.includes("new URL(")) inNewUrlBlock = true;
      if (inNewUrlBlock) {
        if (line.includes("import.meta.url")) inNewUrlBlock = false;
        continue;
      }
      // Rule 1: No relative cross-package imports
      // Exclude new URL(...) file path references and seed file reads
      if (FORBIDDEN_CROSS_PKG.test(line)) {
        console.error(`VIOLATION: ${relFile}:${i + 1}: relative cross-package import`);
        console.error(`  ${line.trim()}`);
        violations += 1;
      }
    }
    // Package-specific restrictions
    for (const [pkgSrc, forbiddenPkgs] of Object.entries(PACKAGE_RESTRICTIONS)) {
      if (relFile.startsWith(pkgSrc + "/") || relFile === pkgSrc) {
        for (const forbidden of forbiddenPkgs) {
          const pattern = new RegExp(`from\\s+["']@living-network/${forbidden.replace("packages/", "")}["']`);
          for (const [i, line] of lines.entries()) {
            if (pattern.test(line)) {
              console.error(`VIOLATION: ${relFile}:${i + 1}: ${pkgSrc} must not depend on ${forbidden}`);
              console.error(`  ${line.trim()}`);
              violations += 1;
            }
          }
        }
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} boundary violation(s) found.`);
  process.exit(1);
} else {
  console.log("No boundary violations found.");
}
