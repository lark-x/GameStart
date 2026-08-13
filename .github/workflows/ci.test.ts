import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("./ci.yml", import.meta.url), "utf8");

test("CI pins toolchain and runs frozen install, all tests, and type checks", () => {
  assert.match(workflow, /pnpm\/action-setup@v4/);
  assert.match(workflow, /version: 11\.1\.2/);
  assert.match(workflow, /node-version: 24\.x/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm typecheck/);
  assert.match(workflow, /pnpm test\b/);
  assert.match(workflow, /pnpm test:coverage/);
  assert.match(workflow, /pnpm build/);
  assert.match(workflow, /pnpm --filter @living-network\/web lint/);
  assert.match(workflow, /permissions:\s+contents: read/);
});

test("V2 real-services job uses Redis and SQLite on PR and push", () => {
  assert.match(workflow, /v2-real-services:/);
  assert.match(workflow, /redis:7/);
  assert.match(workflow, /redis-cli ping/);
  assert.match(workflow, /RUN_V2_REAL_INTEGRATION: "1"/);
  assert.match(workflow, /REDIS_URL: redis:\/\/localhost:6379/);
  assert.match(workflow, /pnpm test:integration/);
});

test("V2 e2e job depends on V2 verify and real-services, runs Playwright", () => {
  assert.match(workflow, /v2-e2e:/);
  assert.match(workflow, /needs: \[v2-verify, v2-real-services\]/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /pnpm test:e2e/);
});
