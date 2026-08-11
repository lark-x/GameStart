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

test("real-services job uses PostgreSQL and Redis service containers on PR and push", () => {
  assert.match(workflow, /real-services:/);
  assert.match(workflow, /postgres:17/);
  assert.match(workflow, /redis:7/);
  assert.match(workflow, /POSTGRES_USER: living_network/);
  assert.match(workflow, /POSTGRES_PASSWORD: living_network_ci/);
  assert.match(workflow, /POSTGRES_DB: living_network/);
  assert.match(workflow, /pg_isready/);
  assert.match(workflow, /redis-cli ping/);
  assert.match(workflow, /RUN_REAL_INTEGRATION: "1"/);
  assert.match(
    workflow,
    /DATABASE_URL: postgresql:\/\/living_network:living_network_ci@localhost:5432\/living_network/,
  );
  assert.match(workflow, /REDIS_URL: redis:\/\/localhost:6379/);
  assert.match(workflow, /pnpm test:integration/);
});

test("e2e job depends on verify and real-services, runs Playwright", () => {
  assert.match(workflow, /e2e:/);
  assert.match(workflow, /needs: \[verify, real-services\]/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /pnpm test:e2e/);
  assert.match(workflow, /pnpm build/);
});
