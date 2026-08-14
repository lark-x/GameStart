import assert from "node:assert/strict";
import test from "node:test";

import { loadV2RuntimeConfig, V2ConfigError } from "./v2.ts";

test("V2 runtime config defaults to disabled external lanes and SQLite", () => {
  const config = loadV2RuntimeConfig({});
  assert.equal(config.api.port, 3002);
  assert.equal(config.scene.enabled, false);
  assert.equal(config.asset.enabled, false);
  assert.equal(config.redisUrl, "redis://127.0.0.1:6379");
  assert.match(config.sqlitePath, /living-network-v2\.sqlite$/);
});

test("V2 runtime config permits UI-configured lanes and validates environment fallbacks", () => {
  assert.equal(loadV2RuntimeConfig({ V2_SCENE_GENERATION_ENABLED: "true" }).scene.enabled, true);
  assert.equal(loadV2RuntimeConfig({ V2_ASSET_GENERATION_ENABLED: "true" }).asset.enabled, true);
  assert.throws(
    () => loadV2RuntimeConfig({ V2_SCENE_GENERATION_ENABLED: "true", LLM_BASE_URL: "https://llm.example" }),
    (error) => error instanceof V2ConfigError && error.field === "LLM_MODEL",
  );
  assert.throws(
    () => loadV2RuntimeConfig({ V2_SCENE_GENERATION_ENABLED: "true", LLM_MODEL: "model" }),
    (error) => error instanceof V2ConfigError && error.field === "LLM_BASE_URL",
  );
});

test("V2 runtime config supports Anthropic and container bind settings", () => {
  const config = loadV2RuntimeConfig({
    V2_API_HOST: "0.0.0.0",
    V2_API_PORT: "4312",
    V2_LLM_PROTOCOL: "anthropic",
    V2_SCENE_GENERATION_ENABLED: "true",
    LLM_BASE_URL: "https://api.anthropic.com",
    LLM_API_KEY: "secret",
    LLM_MODEL: "claude-test",
  });
  assert.equal(config.api.host, "0.0.0.0");
  assert.equal(config.api.port, 4312);
  assert.equal(config.scene.protocol, "anthropic");
  assert.equal(config.scene.model, "claude-test");
});

test("V2 runtime config rejects protocols that do not match their adapter", () => {
  assert.throws(
    () => loadV2RuntimeConfig({ LLM_BASE_URL: "redis://127.0.0.1:6379" }),
    (error) => error instanceof V2ConfigError && error.field === "LLM_BASE_URL",
  );
  assert.throws(
    () => loadV2RuntimeConfig({ COMFYUI_BASE_URL: "redis://127.0.0.1:6379" }),
    (error) => error instanceof V2ConfigError && error.field === "COMFYUI_BASE_URL",
  );
  const config = loadV2RuntimeConfig({ REDIS_URL: "rediss://redis.example:6380/0" });
  assert.equal(config.redisUrl, "rediss://redis.example:6380/0");
});

test("V2 runtime config validates boolean, integer, protocol, and path inputs", () => {
  assert.throws(() => loadV2RuntimeConfig({ V2_SCENE_GENERATION_ENABLED: "maybe" }), /boolean/);
  assert.throws(() => loadV2RuntimeConfig({ V2_API_PORT: "0" }), /positive integer/);
  assert.throws(() => loadV2RuntimeConfig({ V2_API_PORT: "not-a-number" }), /positive integer/);
  assert.throws(() => loadV2RuntimeConfig({ V2_LLM_PROTOCOL: "other" }), /openai-compatible/);
  assert.throws(() => loadV2RuntimeConfig({ LLM_BASE_URL: "not-a-url" }), /valid URL/);
  assert.throws(() => loadV2RuntimeConfig({ REDIS_URL: "http://redis.example" }), /supported URL protocol/);
  assert.equal(loadV2RuntimeConfig({ V2_SQLITE_PATH: ":memory:" }).sqlitePath, ":memory:");
});
