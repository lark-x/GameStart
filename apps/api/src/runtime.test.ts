import assert from "node:assert/strict";
import test from "node:test";

import { loadAppConfig } from "@living-network/config";
import { createInMemoryRepositories } from "@living-network/database";
import {
  closeApiRuntime,
  createApiRuntime,
  createApiRuntimeFromEnvironment,
  getApiListenOptions,
  listenApiRuntime,
} from "./index.ts";
import { createServer } from "node:http";
import { once } from "node:events";

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

test("listens on an ephemeral HTTP port and closes both active and inactive servers", async () => {
  const config = loadAppConfig({ ...environment, API_PORT: "4312" });
  const server = createServer((_request, reply) => reply.end("ok"));
  const runtime = {
    config: { ...config, api: { ...config.api, port: 0 } },
    application: createApiRuntime(config, createInMemoryRepositories()).application,
    server,
  } as const;
  const listening = await listenApiRuntime(runtime);
  assert.equal(listening.listening, true);
  await closeApiRuntime(runtime);
  await closeApiRuntime(runtime);
  assert.equal(server.listening, false);
});

test("listenApiRuntime rejects when the server cannot bind its port", async () => {
  const first = createServer();
  first.listen(0, "127.0.0.1");
  await once(first, "listening");
  const address = first.address();
  assert.ok(address && typeof address !== "string");
  const config = loadAppConfig({ ...environment, API_PORT: String(address.port) });
  const second = createServer();
  const runtime = {
    config,
    application: createApiRuntime(config, createInMemoryRepositories()).application,
    server: second,
  } as const;
  await assert.rejects(listenApiRuntime(runtime));
  await new Promise<void>((resolve, reject) => first.close((error) => error ? reject(error) : resolve()));
});
