import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const roots = [
  ".github/workflows",
  "packages/domain/src",
  "packages/contracts/src",
  "packages/config/src",
  "packages/ai/src",
  "packages/database/src",
  "apps/api/src",
  "apps/web",
  "apps/web/src",
  "apps/worker/src",
  "integration",
  "infra/compose",
];

const excluded = new Map([
  ["apps/api/src/runtime.test.ts", "sandbox forbids local port binding"],
  ["apps/api/src/server.test.ts", "sandbox forbids local port binding"],
  ["packages/database/src/postgres.test.ts", "pg package is an external runtime dependency"],
  ["apps/worker/src/queue.test.ts", "bullmq package is an external runtime dependency"],
]);

async function collectTests(directory) {
  const absolute = join(root, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTests(child));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(child.split(sep).join("/"));
    }
  }
  return files;
}

const discovered = (await Promise.all(roots.map(collectTests))).flat().sort();
const tests = discovered.filter((file) => !excluded.has(file));
console.log(`Running ${tests.length} local regression files.`);
for (const [file, reason] of excluded) console.log(`Excluded ${file}: ${reason}.`);

const result = spawnSync(process.execPath, ["--test", ...tests], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
