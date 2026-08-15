#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { classifyPath, loadModuleRegistry, normalizeRepoPath } from "./governance-lib.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const moduleName = process.argv[2];
const registry = loadModuleRegistry(ROOT);

if (moduleName === undefined || !(moduleName in registry.modules)) {
  console.error(`Usage: node scripts/run-module-tests.mjs <${Object.keys(registry.modules).join("|")}>`);
  process.exit(2);
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (["node_modules", "dist", "coverage", ".git"].includes(entry)) continue;
      files.push(...walk(path));
    } else if (/\.test\.(?:ts|mts|js|mjs)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

const tests = ["apps", "packages"]
  .flatMap((root) => walk(resolve(ROOT, root)))
  .map((path) => normalizeRepoPath(relative(ROOT, path)))
  .filter((path) => classifyPath(registry, path).module === moduleName)
  .sort();

if (tests.length === 0) {
  console.error(`Module ${moduleName} has no owned test files; add a module-local test instead of silently passing.`);
  process.exit(1);
}

console.log(`Running ${tests.length} ${moduleName} test file(s).`);
for (const path of tests) console.log(path);
const result = spawnSync(process.execPath, ["--test", ...tests], { cwd: ROOT, stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
