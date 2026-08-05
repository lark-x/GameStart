import assert from "node:assert/strict";
import test from "node:test";

import { ApiApplication, createApiStore } from "./index.ts";

test("readiness endpoint reports dependency failures separately from health", async () => {
  const app = new ApiApplication(createApiStore(), undefined, {}, {}, {
    readiness: async () => { throw new Error("database unavailable"); },
  });
  const health = await app.handle(new Request("http://localhost/health"));
  const ready = await app.handle(new Request("http://localhost/ready"));
  assert.equal(health.status, 200);
  assert.equal(ready.status, 503);
  assert.equal((await ready.json() as { error: { code: string } }).error.code, "SERVICE_UNAVAILABLE");
});
