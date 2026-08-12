#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const files = new Set();

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      walk(full);
    } else if (entry.endsWith(".test.ts") || entry.endsWith(".test.mts") || entry.endsWith(".test.js")) {
      files.add(relative(root, full));
    }
  }
}

if (args.length === 0) {
  walk(resolve(root, "src"));
} else {
  for (const arg of args) walk(resolve(root, arg));
}

const discoveredFiles = [...files].sort();
console.log(`Discovered ${discoveredFiles.length} test file(s).`);
for (const file of discoveredFiles) console.log(file);

if (discoveredFiles.length === 0) {
  console.error("No test files discovered.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...discoveredFiles], {
  cwd: root,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
