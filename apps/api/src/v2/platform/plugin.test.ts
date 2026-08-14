import assert from "node:assert/strict";
import test from "node:test";

import { createV2ModelCallLog, openV2TempSqliteConnection, V2SqlitePlatformRepository } from "@living-network/database/v2";
import { createV2ApiRuntime } from "./runtime.ts";

test("V2 platform API stores model profiles without returning secrets and exposes live capabilities", async () => {
  const temp = openV2TempSqliteConnection();
  const path = temp.path;
  temp.db.close();
  const runtime = createV2ApiRuntime({
    sqlitePath: path,
    integrationSecretKey: Buffer.alloc(32, 9).toString("base64"),
    capabilities: {
      sceneGeneration: { enabled: true },
      assetGeneration: { enabled: true },
    },
  });
  try {
    const before = await runtime.app.inject({ method: "GET", url: "/api/v2/platform/capabilities" });
    assert.equal(before.statusCode, 200);
    assert.equal(before.json().sceneGeneration.configured, false);
    assert.equal(before.json().assetGeneration.configured, false);

    const created = await runtime.app.inject({
      method: "POST",
      url: "/api/v2/platform/model-profiles",
      payload: {
        name: "Primary",
        protocol: "openai-compatible",
        baseUrl: "https://llm.example/v1",
        model: "creator-model",
        apiKey: "super-secret-key",
        timeoutMs: 12000,
        maxTokens: 1024,
        temperature: 0.5,
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().profile.hasApiKey, true);
    assert.equal("apiKey" in created.json().profile, false);
    const profileId = created.json().profile.id as string;

    const preserved = await runtime.app.inject({
      method: "PUT",
      url: `/api/v2/platform/model-profiles/${encodeURIComponent(profileId)}`,
      payload: {
        name: "Primary Updated",
        protocol: "openai-compatible",
        baseUrl: "https://llm.example/v2",
        model: "creator-model-v2",
      },
    });
    assert.equal(preserved.statusCode, 200);
    assert.equal(preserved.json().profile.hasApiKey, true);
    const replaced = await runtime.app.inject({
      method: "PUT",
      url: `/api/v2/platform/model-profiles/${encodeURIComponent(profileId)}`,
      payload: {
        name: "Primary Replaced",
        protocol: "openai-compatible",
        baseUrl: "https://llm.example/v3",
        model: "creator-model-v3",
        apiKey: "new-secret-key",
      },
    });
    assert.equal(replaced.statusCode, 200);
    const postedUpdate = await runtime.app.inject({
      method: "POST",
      url: "/api/v2/platform/model-profiles",
      payload: {
        id: profileId,
        name: "Primary Posted",
        protocol: "openai-compatible",
        baseUrl: "https://llm.example/v4",
        model: "creator-model-v4",
      },
    });
    assert.equal(postedUpdate.statusCode, 200);

    const invalidProfile = await runtime.app.inject({ method: "POST", url: "/api/v2/platform/model-profiles", payload: "null", headers: { "content-type": "application/json" } });
    assert.equal(invalidProfile.statusCode, 422);
    const invalidUrl = await runtime.app.inject({
      method: "POST",
      url: "/api/v2/platform/model-profiles",
      payload: { name: "Bad", protocol: "openai-compatible", baseUrl: "not-a-url", model: "m" },
    });
    assert.equal(invalidUrl.statusCode, 422);
    const invalidProtocol = await runtime.app.inject({
      method: "POST",
      url: "/api/v2/platform/model-profiles",
      payload: { name: "Bad protocol", protocol: "unsupported", baseUrl: "https://llm.example", model: "m" },
    });
    assert.equal(invalidProtocol.statusCode, 422);
    const missingUpdate = await runtime.app.inject({
      method: "PUT",
      url: "/api/v2/platform/model-profiles/profile%3Amissing",
      payload: { name: "Missing", protocol: "openai-compatible", baseUrl: "https://llm.example", model: "m" },
    });
    assert.equal(missingUpdate.statusCode, 404);

    const bound = await runtime.app.inject({
      method: "PUT",
      url: "/api/v2/platform/model-bindings/scene_generation",
      payload: { profileId },
    });
    assert.equal(bound.statusCode, 200);
    const after = await runtime.app.inject({ method: "GET", url: "/api/v2/platform/capabilities" });
    assert.equal(after.json().sceneGeneration.configured, true);
    assert.equal(after.json().sceneGeneration.source, "profile");

    const conflictDelete = await runtime.app.inject({ method: "DELETE", url: `/api/v2/platform/model-profiles/${encodeURIComponent(profileId)}` });
    assert.equal(conflictDelete.statusCode, 409);
    const cleared = await runtime.app.inject({
      method: "PUT",
      url: "/api/v2/platform/model-bindings/scene_generation",
      payload: { profileId: null },
    });
    assert.equal(cleared.statusCode, 200);

    const invalidCapability = await runtime.app.inject({ method: "PUT", url: "/api/v2/platform/model-bindings/unknown", payload: { profileId: null } });
    assert.equal(invalidCapability.statusCode, 422);
    const bindings = await runtime.app.inject({ method: "GET", url: "/api/v2/platform/model-bindings" });
    assert.equal(bindings.statusCode, 200);

    const image = await runtime.app.inject({ method: "PUT", url: "/api/v2/platform/image-service", payload: { baseUrl: "", timeoutMs: 45000, defaultWorkflowVersion: "workflow@2" } });
    assert.equal(image.statusCode, 200);
    assert.equal(image.json().settings.defaultWorkflowVersion, "workflow@2");
    const imageRead = await runtime.app.inject({ method: "GET", url: "/api/v2/platform/image-service" });
    assert.equal(imageRead.statusCode, 200);
    const invalidAppearance = await runtime.app.inject({ method: "PUT", url: "/api/v2/platform/appearance", payload: { themeId: "unsupported" } });
    assert.equal(invalidAppearance.statusCode, 422);

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({
        id: "test-response",
        model: "creator-model-v3",
        choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      }), { status: 200 });
      const tested = await runtime.app.inject({ method: "POST", url: `/api/v2/platform/model-profiles/${encodeURIComponent(profileId)}/test` });
      assert.equal(tested.statusCode, 200);
      assert.equal(tested.json().success, true);
      globalThis.fetch = async () => new Response("provider failed", { status: 502 });
      const failedTest = await runtime.app.inject({ method: "POST", url: `/api/v2/platform/model-profiles/${encodeURIComponent(profileId)}/test` });
      assert.equal(failedTest.statusCode, 500);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const missingTest = await runtime.app.inject({ method: "POST", url: "/api/v2/platform/model-profiles/profile%3Amissing/test" });
    assert.equal(missingTest.statusCode, 404);
    const deleted = await runtime.app.inject({ method: "DELETE", url: `/api/v2/platform/model-profiles/${encodeURIComponent(profileId)}` });
    assert.equal(deleted.statusCode, 204);

    const appearance = await runtime.app.inject({
      method: "PUT",
      url: "/api/v2/platform/appearance",
      payload: { themeId: "ocean" },
    });
    assert.equal(appearance.statusCode, 200);
    assert.equal(appearance.json().settings.themeId, "ocean");
  } finally {
    await runtime.close();
    temp.cleanup();
  }
});

test("V2 platform capability status detects missing encrypted secret and validates log retention input", async () => {
  const temp = openV2TempSqliteConnection();
  const path = temp.path;
  temp.db.close();
  const seeded = createV2ApiRuntime({
    sqlitePath: path,
    integrationSecretKey: Buffer.alloc(32, 3).toString("base64"),
    capabilities: { sceneGeneration: { enabled: true }, assetGeneration: { enabled: false } },
  });
  try {
    const created = await seeded.app.inject({
      method: "POST",
      url: "/api/v2/platform/model-profiles",
      payload: { name: "Encrypted", protocol: "openai-compatible", baseUrl: "https://llm.example", model: "m", apiKey: "secret" },
    });
    const profileId = created.json().profile.id as string;
    await seeded.app.inject({ method: "PUT", url: "/api/v2/platform/model-bindings/scene_generation", payload: { profileId } });
  } finally {
    await seeded.close();
  }
  const wrongKeyRuntime = createV2ApiRuntime({
    sqlitePath: path,
    integrationSecretKey: Buffer.alloc(32, 4).toString("base64"),
    capabilities: { sceneGeneration: { enabled: true }, assetGeneration: { enabled: false } },
  });
  try {
    const capabilities = await wrongKeyRuntime.app.inject({ method: "GET", url: "/api/v2/platform/capabilities" });
    assert.equal(capabilities.json().sceneGeneration.configured, false);
    assert.equal(capabilities.json().sceneGeneration.reason, "secret_unavailable");
  } finally {
    await wrongKeyRuntime.close();
  }
  const runtime = createV2ApiRuntime({
    sqlitePath: path,
    capabilities: { sceneGeneration: { enabled: true }, assetGeneration: { enabled: false } },
  });
  try {
    const capabilities = await runtime.app.inject({ method: "GET", url: "/api/v2/platform/capabilities" });
    assert.equal(capabilities.json().sceneGeneration.configured, false);
    assert.equal(capabilities.json().sceneGeneration.reason, "secret_unavailable");
    const invalidDate = await runtime.app.inject({ method: "DELETE", url: "/api/v2/platform/model-call-logs?before=invalid" });
    assert.equal(invalidDate.statusCode, 422);
    const validDate = await runtime.app.inject({ method: "DELETE", url: "/api/v2/platform/model-call-logs?before=2026-01-01T00%3A00%3A00.000Z" });
    assert.equal(validDate.statusCode, 200);
  } finally {
    await runtime.close();
    temp.cleanup();
  }
});

test("V2 platform API returns model call logs with filters and details", async () => {
  const temp = openV2TempSqliteConnection();
  const path = temp.path;
  temp.db.close();
  const runtime = createV2ApiRuntime({ sqlitePath: path });
  try {
    const repository = new V2SqlitePlatformRepository(runtime.db);
    const log = createV2ModelCallLog({
      capability: "scene_generation",
      startedAt: "2026-08-14T10:00:00.000Z",
      correlationId: "corr:api-test",
      requestMessages: [{ role: "user", content: "safe request" }],
    });
    await repository.startModelCall({ log });
    await repository.completeModelCall({
      id: log.id,
      completedAt: "2026-08-14T10:00:00.010Z",
      durationMs: 10,
      responseText: "safe response",
    });

    const page = await runtime.app.inject({ method: "GET", url: "/api/v2/platform/model-call-logs?status=success&query=corr%3Aapi-test" });
    assert.equal(page.statusCode, 200);
    assert.equal(page.json().items[0].id, log.id);
    const detail = await runtime.app.inject({ method: "GET", url: `/api/v2/platform/model-call-logs/${encodeURIComponent(log.id)}` });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().log.responseText, "safe response");
  } finally {
    await runtime.close();
    temp.cleanup();
  }
});
