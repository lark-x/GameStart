import assert from "node:assert/strict";
import test from "node:test";

import { loadAppConfig } from "../../../packages/config/src/index.ts";
import { createInMemoryRepositories } from "../../../packages/database/src/index.ts";
import {
  closeApiRuntime,
  createApiRuntime,
  createApiRuntimeFromEnvironment,
  getApiListenOptions,
} from "./index.ts";

const environment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/living_network_test",
  API_HOST: "127.0.0.1",
  API_PORT: "4310",
} as const;

test("assembles config, repositories, application, and server without hidden storage", async () => {
  const config = loadAppConfig(environment);
  const repositories = createInMemoryRepositories();
  const runtime = createApiRuntime(config, repositories);

  assert.equal(runtime.config, config);
  assert.equal(runtime.application.store, repositories);
  assert.equal(runtime.server.listening, false);
  assert.deepEqual(getApiListenOptions(config), {
    host: "127.0.0.1",
    port: 4310,
  });

  await closeApiRuntime(runtime);
});

test("builds the same runtime wiring from an explicit environment input", async () => {
  const repositories = createInMemoryRepositories();
  const runtime = createApiRuntimeFromEnvironment(environment, repositories);

  assert.equal(runtime.config.environment, "test");
  assert.deepEqual(getApiListenOptions(runtime.config), {
    host: environment.API_HOST,
    port: Number(environment.API_PORT),
  });
  assert.equal(runtime.application.store, repositories);

  await closeApiRuntime(runtime);
});
