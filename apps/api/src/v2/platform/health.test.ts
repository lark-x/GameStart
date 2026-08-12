import assert from "node:assert/strict";
import test from "node:test";

import { createV2FastifyApp } from "./index.ts";

test("V2 Fastify health route responds through injection", async () => {
  const app = createV2FastifyApp();
  await app.ready();
  try {
    const response = await app.inject({ method: "GET", url: "/api/v2/health" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true, version: "v2" });
  } finally {
    await app.close();
  }
});
