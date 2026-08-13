import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const roots = [
  ".github/workflows",
  "packages/config/src",
  "packages/domain/src/v2",
  "packages/contracts/src/v2",
  "packages/ai/src",
  "packages/database/src/v2",
  "apps/api/src/v2",
  "apps/web/src/v2",
  "apps/worker/src/v2",
  "integration",
  "infra/compose",
];

const explicitTests = [
  "packages/config/src/v2.test.ts",
  "packages/ai/src/v2-scene-generation.test.ts",
  ".github/workflows/ci.test.ts",
  "infra/compose/compose.test.ts",
];

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

const discovered = (await Promise.all(roots.map(collectTests))).flat();
const v2Discovered = discovered.filter((file) => /(?:^|\/)v2(?:[./-]|\/)/.test(file));
const tests = [...new Set([...explicitTests, ...v2Discovered])].sort();
console.log(`Running ${tests.length} local regression files.`);

const result = spawnSync(process.execPath, ["--test", ...tests], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
