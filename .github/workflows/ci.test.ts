import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("./ci.yml", import.meta.url), "utf8");

test("CI pins toolchain and runs frozen install, all tests, and type checks", () => {
  assert.match(workflow, /pnpm\/action-setup@v4/);
  assert.match(workflow, /version: 11\.1\.2/);
  assert.match(workflow, /node-version: 24\.x/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm test:all/);
  assert.match(workflow, /pnpm typecheck/);
  assert.match(workflow, /permissions:\s+contents: read/);
});
