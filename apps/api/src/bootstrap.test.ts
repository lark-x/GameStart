import assert from "node:assert/strict";
import test from "node:test";

import { createApiRuntimeFromEnvironment } from "./runtime.ts";
import { createDevelopmentRepositories } from "./dev-seed.ts";

test("development bootstrap assembles explicit seed data without hidden storage", async () => {
  const repositories = createDevelopmentRepositories();
  const worlds = await repositories.storyWorlds.list();
  assert.deepEqual(worlds.map((world) => world.id), ["dev-world"]);
  const runtime = createApiRuntimeFromEnvironment({
    NODE_ENV: "test",
    API_HOST: "127.0.0.1",
    API_PORT: "4311",
    DATABASE_URL: "postgresql://127.0.0.1/living_network_test",
  }, repositories);
  assert.equal(runtime.server.listening, false);
  const response = await runtime.application.handle(new Request("http://localhost/v1/worlds"));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { data: Array<{ id: string }> }).data.map((world) => world.id), ["dev-world"]);
});
