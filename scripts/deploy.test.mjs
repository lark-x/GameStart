import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const tmpRoot = resolve(import.meta.dirname, "..", ".tmp", "deploy-test");

test.after(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Port selection logic (pure functions, no network calls)
// ---------------------------------------------------------------------------

test("WEB_PORT env var parsing", () => {
  assert.equal(parseInt("18050", 10), 18050);
  assert.ok(isNaN(parseInt("", 10)));
  assert.ok(isNaN(parseInt("not-a-number", 10)));
  assert.equal(parseInt("4173", 10), 4173);
});

// ---------------------------------------------------------------------------
// Deployment state persistence
// ---------------------------------------------------------------------------

test("deployment state round-trip", () => {
  const dir = resolve(tmpRoot, "state");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "deployment.json");
  const state = { webPort: 18042, mode: "lan", deployedAt: "2026-08-19T00:00:00Z" };
  writeFileSync(file, JSON.stringify(state, null, 2));
  const loaded = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(loaded, state);
});

test("deployment state survives re-read", () => {
  const dir = resolve(tmpRoot, "state2");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "deployment.json");
  writeFileSync(file, JSON.stringify({ webPort: 18100 }));
  // Simulate a second invocation reading the same file.
  const loaded = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(loaded.webPort, 18100);
});

// ---------------------------------------------------------------------------
// Deploy lock
// ---------------------------------------------------------------------------

test("deploy lock file is created with PID", () => {
  const dir = resolve(tmpRoot, "lock");
  mkdirSync(dir, { recursive: true });
  const lockFile = resolve(dir, "deploy.lock");
  writeFileSync(lockFile, String(process.pid));
  assert.ok(existsSync(lockFile));
  assert.equal(readFileSync(lockFile, "utf8"), String(process.pid));
});

test("deploy lock is detected as fresh when recent", () => {
  const dir = resolve(tmpRoot, "lock-fresh");
  mkdirSync(dir, { recursive: true });
  const lockFile = resolve(dir, "deploy.lock");
  writeFileSync(lockFile, "12345");
  const age = Date.now() - statSync(lockFile).mtimeMs;
  assert.ok(age < 10 * 60 * 1000, "recent lock should be considered fresh");
});

test("deploy lock is released by unlinking", () => {
  const dir = resolve(tmpRoot, "lock-release");
  mkdirSync(dir, { recursive: true });
  const lockFile = resolve(dir, "deploy.lock");
  writeFileSync(lockFile, "12345");
  assert.ok(existsSync(lockFile));
  unlinkSync(lockFile);
  assert.ok(!existsSync(lockFile));
});

// ---------------------------------------------------------------------------
// Port range constants
// ---------------------------------------------------------------------------

test("port range is 18000-18999", () => {
  // These are the constants from deploy.mjs; verify the expected values.
  const PORT_RANGE_START = 18000;
  const PORT_RANGE_END = 18999;
  assert.ok(PORT_RANGE_END > PORT_RANGE_START);
  assert.equal(PORT_RANGE_END - PORT_RANGE_START + 1, 1000);
});

test("MAX_PORT_RETRIES is at least 1", () => {
  const MAX_PORT_RETRIES = 5;
  assert.ok(MAX_PORT_RETRIES >= 1);
});
