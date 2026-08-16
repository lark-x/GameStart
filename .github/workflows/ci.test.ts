import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("./ci.yml", import.meta.url), "utf8");

test("CI pins toolchain and runs fast PR verification", () => {
  assert.match(workflow, /pnpm\/action-setup@v4/);
  assert.match(workflow, /version: 11\.1\.2/);
  assert.match(workflow, /node-version: 24\.x/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm check:boundaries/);
  assert.match(workflow, /pnpm typecheck/);
  assert.match(workflow, /pnpm test\b/);
  assert.match(workflow, /pnpm --filter @living-network\/web lint/);
  assert.match(workflow, /pnpm build/);
  assert.match(workflow, /permissions:\s+contents: read/);
});

test("PR verify job does not require coverage, real services, or e2e", () => {
  const verifyJob = workflow.slice(workflow.indexOf("verify:"), workflow.indexOf("integration:"));
  assert.doesNotMatch(verifyJob, /test:coverage/);
  assert.doesNotMatch(verifyJob, /test:integration/);
  assert.doesNotMatch(verifyJob, /test:e2e/);
});

test("integration job runs Redis and SQLite only on main push or manual dispatch", () => {
  assert.match(workflow, /integration:/);
  assert.match(workflow, /redis:7/);
  assert.match(workflow, /redis-cli ping/);
  assert.match(workflow, /RUN_V2_REAL_INTEGRATION: "1"/);
  assert.match(workflow, /REDIS_URL: redis:\/\/localhost:6379/);
  assert.match(workflow, /pnpm test:integration/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
});

test("e2e job depends on verify and runs Playwright on main push or manual dispatch", () => {
  assert.match(workflow, /e2e:/);
  assert.match(workflow, /needs: verify/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /pnpm test:e2e/);
});
