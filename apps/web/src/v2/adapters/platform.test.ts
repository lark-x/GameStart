import assert from "node:assert/strict";
import test from "node:test";

import { createV2PlatformClient, V2PlatformClientError } from "./platform.ts";

test("V2 platform client maps configuration endpoints and handles empty deletes", async () => {
  const calls: Array<{ readonly url: string; readonly method: string; readonly body?: unknown }> = [];
  const client = createV2PlatformClient({
    baseUrl: "http://localhost/",
    fetchImpl: async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
      calls.push({ url, method, ...(body === undefined ? {} : { body }) });
      if (url.endsWith("/model-profiles") && method === "GET") return Response.json({ profiles: [] });
      if (url.endsWith("/model-profiles") && method === "POST") return Response.json({ profile: { id: "profile:one", name: body.name, protocol: body.protocol, baseUrl: body.baseUrl, model: body.model, timeoutMs: 30000, maxTokens: 4096, temperature: 0.2, hasApiKey: true, createdAt: "now", updatedAt: "now" } }, { status: 201 });
      if (url.includes("/model-profiles/profile%3Aone") && method === "DELETE") return new Response(null, { status: 204 });
      if (url.endsWith("/model-bindings") && method === "GET") return Response.json({ bindings: [] });
      if (url.endsWith("/model-bindings/scene_generation") && method === "PUT") return Response.json({ binding: { capability: "scene_generation", profileId: body.profileId, profileName: "One" } });
      if (url.endsWith("/image-service") && method === "GET") return Response.json({ settings: { baseUrl: "", timeoutMs: 30000 } });
      if (url.endsWith("/image-service") && method === "PUT") return Response.json({ settings: { baseUrl: "http://comfy", timeoutMs: 30000 } });
      if (url.endsWith("/image-service/test") && method === "POST") return Response.json({ check: { service: "comfyui", connection: "ok", checkedAt: "now", durationMs: 10 } });
      if (url.endsWith("/appearance") && method === "GET") return Response.json({ settings: { themeId: "dawn" } });
      if (url.endsWith("/appearance") && method === "PUT") return Response.json({ settings: { themeId: "ocean" } });
      if (url.endsWith("/capabilities") && method === "GET") return Response.json({ sceneGeneration: { enabled: true, configured: true, source: "profile" }, assetGeneration: { enabled: false, configured: false, source: "none" } });
      if (url.includes("/model-profiles/discover-models") && method === "POST") return Response.json({ models: ["model-a", "model-b"] });
      if (url.includes("/model-profiles/profile%3Aone/test") && method === "POST") return Response.json({ success: true, preview: "OK" });
      if (url.includes("/model-call-logs?") && method === "GET") return Response.json({ items: [], nextCursor: "next" });
      if (url.includes("/model-call-logs/") && method === "GET") return Response.json({ log: { id: "log", status: "success", capability: "scene_generation", startedAt: "now", requestTruncated: false, responseTruncated: false } });
      if (url.includes("/model-call-logs?") && method === "DELETE") return Response.json({ deleted: 1 });
      throw new Error(`Unhandled ${method} ${url}`);
    },
  });

  assert.deepEqual(await client.listModelProfiles(), []);
  const saved = await client.saveModelProfile({ name: "One", protocol: "openai-compatible", baseUrl: "https://llm.example", model: "m", apiKey: "secret" });
  assert.equal(saved.id, "profile:one");
  assert.deepEqual(await client.discoverModels({ protocol: "openai-compatible", baseUrl: "https://llm.example", apiKey: "secret" }), ["model-a", "model-b"]);
  assert.equal((await client.testModelProfile("profile:one")).success, true);
  assert.deepEqual(await client.listModelBindings(), []);
  assert.equal((await client.setModelBinding("scene_generation", { profileId: "profile:one" })).profileId, "profile:one");
  assert.equal((await client.getImageServiceSettings()).timeoutMs, 30000);
  assert.equal((await client.saveImageServiceSettings({ baseUrl: "http://comfy" })).baseUrl, "http://comfy");
  assert.equal((await client.testImageServiceConnection()).connection, "ok");
  assert.equal((await client.getAppearanceSettings()).themeId, "dawn");
  assert.equal((await client.saveAppearanceSettings({ themeId: "ocean" })).themeId, "ocean");
  assert.equal((await client.getCapabilities()).sceneGeneration.configured, true);
  assert.equal((await client.queryModelCallLogs({ query: "corr:one", limit: 10 })).nextCursor, "next");
  assert.equal((await client.getModelCallLog("log")).id, "log");
  assert.equal(await client.deleteModelCallLogs("2026-01-01T00:00:00.000Z"), 1);
  await client.deleteModelProfile("profile:one");
  assert.equal(calls.some((call) => call.method === "DELETE"), true);
  assert.equal(calls.some((call) => call.body && JSON.stringify(call.body).includes("secret")), true);
});

test("V2 platform client exposes structured API errors", async () => {
  const client = createV2PlatformClient({
    baseUrl: "http://localhost",
    fetchImpl: async () => Response.json({ error: { code: "VALIDATION_FAILED", message: "bad profile" } }, { status: 422 }),
  });
  await assert.rejects(
    () => client.listModelProfiles(),
    (error: unknown) => error instanceof V2PlatformClientError && error.code === "VALIDATION_FAILED" && error.status === 422,
  );
});
