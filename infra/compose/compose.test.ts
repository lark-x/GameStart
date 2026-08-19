import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync(new URL("./docker-compose.yml", import.meta.url), "utf8");
const devCompose = readFileSync(new URL("./docker-compose.dev.yml", import.meta.url), "utf8");

test("local compose pins V2 infrastructure and health checks stateful services", () => {
  assert.doesNotMatch(compose, /postgres|postgresql|minio/i);
  assert.match(compose, /image: redis:7\.2-alpine/);
  assert.match(compose, /redis-cli/);
  assert.match(compose, /redis_data:/);
  assert.match(compose, /sqlite_data:/);
  assert.doesNotMatch(compose, /image: [^\n]*:latest/);
});

test("compose keeps V2 lane switches configurable", () => {
  assert.match(compose, /V2_SCENE_GENERATION_ENABLED: \$\{V2_SCENE_GENERATION_ENABLED:-false\}/);
  assert.match(compose, /V2_ASSET_GENERATION_ENABLED: \$\{V2_ASSET_GENERATION_ENABLED:-false\}/);
});

test("compose runs the persistent V2 application stack with API-owned SQLite migrations", () => {
  assert.doesNotMatch(compose, /^  migrate:/m);
  assert.match(compose, /start:v2/);
  assert.match(compose, /^  api:/m);
  assert.match(compose, /^  worker:/m);
  assert.match(compose, /^  web:/m);
  assert.match(compose, /restart: unless-stopped/g);
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /env_file:/);
  assert.match(compose, /REDIS_URL: redis:\/\/redis:6379/);
  assert.match(compose, /V2_SQLITE_PATH: \/app\/data\/sqlite\/living-network-v2\.sqlite/);
  assert.match(compose, /media_data:\/app\/data\/media/);
  assert.match(compose, /sqlite_data:\/app\/data\/sqlite/);
  assert.match(compose, /^  media_data:/m);
});

test("compose enforces network isolation and only exposes web to host", () => {
  // Redis and API should only use expose, never host ports in production compose
  assert.match(compose, /services:\s*\n\s*redis:\s*\n[\s\S]*?expose:\s*\n\s*-\s*"6379"/);
  assert.match(compose, /api:\s*\n[\s\S]*?expose:\s*\n\s*-\s*"3003"/);
  assert.doesNotMatch(compose, /redis:[\s\S]*?ports:\s*\n\s*-\s*"\$\{REDIS_PORT/);
  assert.doesNotMatch(compose, /api:[\s\S]*?ports:\s*\n\s*-\s*"\$\{API_PORT/);

  // Web is the only service publishing host ports, with safe fallback
  assert.match(compose, /published:\s*"\$\{WEB_PORT:-4173\}"/);
  assert.match(compose, /host_ip:\s*"\$\{WEB_HOST_BIND:-127\.0\.0\.1\}"/);
});

test("dev overlay enables optional host port debugging for redis and api", () => {
  assert.match(devCompose, /services:\s*\n\s*redis:\s*\n\s*ports:\s*\n\s*-\s*"\$\{REDIS_DEV_PORT:-6379\}:6379"/);
  assert.match(devCompose, /api:\s*\n\s*ports:\s*\n\s*-\s*"\$\{API_DEV_PORT:-3003\}:3003"/);
});

test("compose publishes the web application through an API reverse proxy", () => {
  const nginx = readFileSync(new URL("./nginx.conf", import.meta.url), "utf8");
  assert.match(nginx, /proxy_pass http:\/\/api:3003/);
  assert.match(nginx, /location \/api\/v2\//);
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
});

test("nginx serves the assets route instead of the static bundle directory", () => {
  const nginx = readFileSync(new URL("./nginx.conf", import.meta.url), "utf8");
  assert.match(nginx, /location = \/assets \{/);
  assert.match(nginx, /location = \/assets\/ \{/);
});
