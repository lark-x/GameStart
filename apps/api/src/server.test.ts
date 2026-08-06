import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { ApiApplication, createApiStore } from "./index.ts";
import { createApiServer, resolveCorsOrigin } from "./server.ts";

test("CORS only reflects explicitly configured origins", () => {
  const allowed = ["http://localhost:4173", "https://dev.example"];
  assert.equal(resolveCorsOrigin("http://localhost:4173", allowed), "http://localhost:4173");
  assert.equal(resolveCorsOrigin("https://dev.example", allowed), "https://dev.example");
  assert.equal(resolveCorsOrigin("http://evil.example", allowed), undefined);
  assert.equal(resolveCorsOrigin(undefined, allowed), undefined);
});

test("HTTP adapter translates requests, handles preflight, and writes API responses", async () => {
  const application = new ApiApplication(createApiStore());
  const server = createApiServer(application, { corsOrigins: ["http://allowed.test"] });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${baseUrl}/health`, {
      headers: { origin: "http://allowed.test", "x-request-id": "request-test" },
    });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-request-id"), "request-test");
    assert.equal(health.headers.get("access-control-allow-origin"), "http://allowed.test");
    assert.deepEqual(await health.json(), { status: "ok" });

    const allowedOptions = await fetch(`${baseUrl}/health`, {
      method: "OPTIONS",
      headers: { origin: "http://allowed.test" },
    });
    assert.equal(allowedOptions.status, 204);
    assert.equal(allowedOptions.headers.get("access-control-allow-methods"), "GET,POST,PUT,DELETE,OPTIONS");

    const deniedOptions = await fetch(`${baseUrl}/health`, {
      method: "OPTIONS",
      headers: { origin: "http://denied.test" },
    });
    assert.equal(deniedOptions.status, 403);

    const bodyRequest = await fetch(`${baseUrl}/unknown`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 1 }),
    });
    assert.equal(bodyRequest.status, 404);
    assert.deepEqual(await bodyRequest.json(), {
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("HTTP adapter turns unexpected application failures into JSON 500 responses", async () => {
  const application = { handle: async () => { throw new Error("unexpected"); } } as unknown as ApiApplication;
  const server = createApiServer(application);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
