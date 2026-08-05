import assert from "node:assert/strict";
import test from "node:test";

import {
  ConfigError,
  getSafeConfigSummary,
  loadAppConfig,
} from "./index.ts";

const minimalEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/living_network_test",
} as const;

test("loads safe development defaults and freezes nested configuration", () => {
  const config = loadAppConfig(minimalEnvironment);

  assert.equal(config.environment, "test");
  assert.deepEqual(config.api, {
    host: "127.0.0.1",
    port: 3000,
    corsOrigins: ["http://127.0.0.1:4173", "http://localhost:4173"],
  });
  assert.equal(config.database.url, minimalEnvironment.DATABASE_URL);
  assert.equal(config.redis.url, "redis://127.0.0.1:6379");
  assert.equal(config.comfyui.baseUrl, "http://127.0.0.1:8188");
  assert.equal(config.comfyui.timeoutMs, 30_000);
  assert.equal(config.flags.manualReviewBeforePublish, true);
  assert.equal(config.flags.imageGenerationEnabled, false);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.flags), true);
});

test("parses explicit URL, port, LLM and feature flag values", () => {
  const config = loadAppConfig({
    ...minimalEnvironment,
    API_HOST: "0.0.0.0",
    API_PORT: "4310",
    API_CORS_ORIGINS: "http://localhost:4173,https://dev.example",
    REDIS_URL: "rediss://cache.example/0",
    COMFYUI_BASE_URL: "https://comfy.example",
    COMFYUI_TIMEOUT_MS: "4500",
    LLM_BASE_URL: "https://llm.example/v1",
    LLM_API_KEY: "secret-value",
    LLM_MODEL: "provider/model",
    MEDIA_ROOT: "/srv/living-network/media",
    AUTONOMOUS_EVENTS_ENABLED: "yes",
    PROACTIVE_MESSAGES_ENABLED: "1",
    MOMENT_GENERATION_ENABLED: "on",
    IMAGE_GENERATION_ENABLED: "true",
    MEMORY_WRITE_ENABLED: "true",
    MEMORY_RETRIEVAL_ENABLED: "yes",
    MANUAL_REVIEW_BEFORE_PUBLISH: "off",
  });

  assert.deepEqual(config.api, {
    host: "0.0.0.0",
    port: 4310,
    corsOrigins: ["http://localhost:4173", "https://dev.example"],
  });
  assert.deepEqual(config.comfyui, { baseUrl: "https://comfy.example", timeoutMs: 4500 });
  assert.deepEqual(config.llm, {
    baseUrl: "https://llm.example/v1",
    apiKey: "secret-value",
    model: "provider/model",
  });
  assert.deepEqual(config.flags, {
    autonomousEventsEnabled: true,
    proactiveMessagesEnabled: true,
    momentGenerationEnabled: true,
    imageGenerationEnabled: true,
    memoryWriteEnabled: true,
    memoryRetrievalEnabled: true,
    manualReviewBeforePublish: false,
  });
});

test("safe summary never exposes the LLM API key", () => {
  const config = loadAppConfig({
    ...minimalEnvironment,
    LLM_API_KEY: "do-not-log",
    LLM_MODEL: "test-model",
  });
  const summary = getSafeConfigSummary(config);

  assert.deepEqual(summary.llm, { model: "test-model", hasApiKey: true });
  assert.equal(JSON.stringify(summary).includes("do-not-log"), false);
});

test("rejects missing and malformed configuration with field-specific errors", () => {
  assert.throws(
    () => loadAppConfig({ NODE_ENV: "test" }),
    { name: "ConfigError", message: /DATABASE_URL/ },
  );
  assert.throws(
    () => loadAppConfig({ ...minimalEnvironment, API_PORT: "0" }),
    { name: "ConfigError", message: /API_PORT/ },
  );
  assert.throws(
    () => loadAppConfig({ ...minimalEnvironment, DATABASE_URL: "http://not-postgres" }),
    { name: "ConfigError", message: /DATABASE_URL.*postgres/ },
  );
  assert.throws(
    () => loadAppConfig({ ...minimalEnvironment, IMAGE_GENERATION_ENABLED: "maybe" }),
    { name: "ConfigError", message: /IMAGE_GENERATION_ENABLED/ },
  );
  assert.throws(
    () => loadAppConfig({ ...minimalEnvironment, COMFYUI_TIMEOUT_MS: "0" }),
    { name: "ConfigError", message: /COMFYUI_TIMEOUT_MS/ },
  );
  assert.throws(
    () => loadAppConfig({ ...minimalEnvironment, API_CORS_ORIGINS: "*" }),
    { name: "ConfigError", message: /API_CORS_ORIGINS/ },
  );
  assert.throws(
    () => loadAppConfig({ ...minimalEnvironment, NODE_ENV: "staging" }),
    { name: "ConfigError", message: /NODE_ENV/ },
  );
  assert.ok(ConfigError.prototype instanceof Error);
});
