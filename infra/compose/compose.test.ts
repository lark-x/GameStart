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

test("compose runs the persistent application stack after a one-shot database bootstrap", () => {
  assert.match(compose, /^  migrate:/m);
  assert.match(compose, /bootstrap:postgres/);
  assert.match(compose, /^  api:/m);
  assert.match(compose, /^  worker:/m);
  assert.match(compose, /^  web:/m);
  assert.match(compose, /restart: unless-stopped/g);
  assert.match(compose, /condition: service_completed_successfully/);
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /env_file:/);
  assert.match(compose, /DATABASE_URL: postgresql:\/\/\$\{POSTGRES_USER:-/);
  assert.match(compose, /REDIS_URL: redis:\/\/redis:6379/);
  assert.match(compose, /media_data:\/app\/data\/media/);
  assert.match(compose, /^  media_data:/m);
});

test("compose publishes the web application through an API reverse proxy", () => {
  const nginx = readFileSync(new URL("./nginx.conf", import.meta.url), "utf8");
  assert.match(nginx, /proxy_pass http:\/\/api:3001/);
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
});


test("nginx serves the assets route instead of the static bundle directory", () => {
  const nginx = readFileSync(new URL("./nginx.conf", import.meta.url), "utf8");
  assert.match(nginx, /location = \/assets \{/);
  assert.match(nginx, /location = \/assets\/ \{/);
});
