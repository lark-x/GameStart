import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync(new URL("./docker-compose.yml", import.meta.url), "utf8");

test("local compose pins required infrastructure and health checks stateful services", () => {
  assert.match(compose, /image: postgres:16\.4-alpine/);
  assert.match(compose, /image: redis:7\.2-alpine/);
  assert.match(compose, /image: minio\/minio:RELEASE\.2025-09-07T16-13-09Z-cpuv1/);
  assert.match(compose, /pg_isready/);
  assert.match(compose, /redis-cli/);
  assert.match(compose, /postgres_data:/);
  assert.match(compose, /redis_data:/);
  assert.match(compose, /minio_data:/);
  assert.doesNotMatch(compose, /image: [^\n]*:latest/);
});

test("compose keeps credentials configurable instead of hard-coding production secrets", () => {
  assert.match(compose, /POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:-/);
  assert.match(compose, /MINIO_ROOT_PASSWORD: \$\{MINIO_ROOT_PASSWORD:-/);
});
