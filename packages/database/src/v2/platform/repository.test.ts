import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  createV2ModelCallLog,
  openV2TempSqliteConnection,
  V2SqlitePlatformRepository,
} from "../index.ts";

test("V2 platform repository persists profiles, bindings, and singleton settings", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqlitePlatformRepository(db);
    const profile = await repository.saveModelProfile({
      id: "profile:writer",
      name: "Writer",
      protocol: "openai-compatible",
      baseUrl: "http://localhost:4000/v1",
      model: "writer-model",
      timeoutMs: 12000,
      maxTokens: 2048,
      temperature: 0.4,
      encryptedApiKey: "ciphertext",
      encryptionIv: "iv",
      createdAt: "2026-08-14T10:00:00.000Z",
      updatedAt: "2026-08-14T10:00:00.000Z",
    });

    assert.deepEqual(await repository.getModelProfile(profile.id), profile);
    assert.deepEqual(await repository.listModelProfiles(), [profile]);
    const binding = await repository.setModelBinding({ capability: "scene_generation", profileId: profile.id });
    assert.equal(binding.capability, "scene_generation");
    assert.equal(binding.profileId, profile.id);
    assert.equal(binding.profileName, "Writer");
    assert.ok(binding.updatedAt);
    assert.equal((await repository.listModelBindings())[0]?.profileId, profile.id);

    assert.deepEqual(await repository.getImageServiceSettings(), { baseUrl: "", timeoutMs: 30000 });
    assert.deepEqual(await repository.saveImageServiceSettings({
      baseUrl: "http://localhost:8188",
      timeoutMs: 45000,
      defaultWorkflowVersion: "v2",
    }), {
      baseUrl: "http://localhost:8188",
      timeoutMs: 45000,
      defaultWorkflowVersion: "v2",
    });
    const appearance = await repository.saveAppearanceSettings({ themeId: "ocean" });
    assert.equal(appearance.themeId, "ocean");
    assert.equal(await repository.getExternalConnectionCheck("comfyui"), undefined);
    assert.deepEqual(await repository.saveExternalConnectionCheck({
      service: "comfyui",
      connection: "failed",
      checkedAt: "2026-08-14T10:00:01.000Z",
      durationMs: 25,
      errorMessage: "connection refused",
    }), {
      service: "comfyui",
      connection: "failed",
      checkedAt: "2026-08-14T10:00:01.000Z",
      durationMs: 25,
      errorMessage: "connection refused",
    });
    assert.equal((await repository.saveExternalConnectionCheck({
      service: "comfyui",
      connection: "ok",
      checkedAt: "2026-08-14T10:00:02.000Z",
      durationMs: 10,
    })).connection, "ok");

    await repository.clearModelBinding("scene_generation");
    assert.equal(await repository.getModelBinding("scene_generation"), undefined);
    await repository.deleteModelProfile(profile.id);
    assert.equal(await repository.getModelProfile(profile.id), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 platform repository persists capability toggles independently of bindings", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqlitePlatformRepository(db);
    assert.equal(await repository.getCapabilitySetting("scene_generation"), undefined);
    const enabled = await repository.setCapabilitySetting({ capability: "scene_generation", enabled: true });
    assert.equal(enabled.capability, "scene_generation");
    assert.equal(enabled.enabled, true);
    assert.ok(enabled.updatedAt);
    assert.equal((await repository.getCapabilitySetting("scene_generation"))?.enabled, true);
    const disabled = await repository.setCapabilitySetting({ capability: "scene_generation", enabled: false });
    assert.equal(disabled.enabled, false);
    assert.equal((await repository.getCapabilitySetting("scene_generation"))?.enabled, false);
    assert.equal(await repository.getCapabilitySetting("asset_generation"), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 platform repository records model call lifecycle and cursor pagination", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqlitePlatformRepository(db);
    const first = createV2ModelCallLog({
      capability: "scene_generation",
      startedAt: "2026-08-14T10:00:00.000Z",
      profileId: "profile:writer",
      profileName: "Writer",
      protocol: "openai-compatible",
      model: "writer-model",
      correlationId: "corr:first",
      jobId: "job:first",
      storyWorldId: "world:first",
      requestMessages: [{ role: "user", content: "Create a scene" }],
    });
    await repository.startModelCall({ log: first });
    const completed = await repository.completeModelCall({
      id: first.id,
      completedAt: "2026-08-14T10:00:00.250Z",
      durationMs: 250,
      providerResponseId: "response:first",
      promptTokens: 12,
      completionTokens: 24,
      totalTokens: 36,
      finishReason: "stop",
      responseText: "A scene",
    });
    assert.equal(completed.status, "success");
    assert.equal(completed.totalTokens, 36);
    assert.equal((await repository.getModelCallLog(first.id))?.responseText, "A scene");

    const second = createV2ModelCallLog({
      capability: "scene_generation",
      startedAt: "2026-08-14T10:01:00.000Z",
      correlationId: "corr:second",
    });
    await repository.startModelCall({ log: second });
    const failed = await repository.failModelCall({
      id: second.id,
      completedAt: "2026-08-14T10:01:00.100Z",
      durationMs: 100,
      errorCode: "UPSTREAM_ERROR",
      errorStatus: 502,
      errorRetryable: true,
      errorMessage: "upstream unavailable",
    });
    assert.equal(failed.status, "error");
    assert.equal(failed.errorRetryable, true);

    const third = createV2ModelCallLog({ capability: "scene_generation", startedAt: "2026-08-14T10:02:00.000Z" });
    await repository.startModelCall({ log: third });
    assert.equal(await repository.markInterruptedModelCalls("2026-08-14T10:03:00.000Z", "2026-08-14T10:04:00.000Z"), 1);
    assert.equal((await repository.getModelCallLog(third.id))?.status, "interrupted");

    const page = await repository.queryModelCallLogs({ limit: 2 });
    assert.equal(page.items.length, 2);
    assert.equal(page.items[0]?.id, third.id);
    assert.ok(page.nextCursor);
    const nextPage = await repository.queryModelCallLogs({ limit: 2, cursor: page.nextCursor });
    assert.deepEqual(nextPage.items.map((item) => item.id), [first.id]);
    assert.equal((await repository.queryModelCallLogs({ status: "error" })).items[0]?.id, second.id);
    assert.equal((await repository.queryModelCallLogs({ query: "corr:first" })).items[0]?.id, first.id);
    await assert.rejects(() => repository.queryModelCallLogs({ cursor: "not-a-valid-cursor" }), /Invalid model call log cursor/);
    db.prepare("UPDATE v2_model_call_logs SET request_messages_json = ? WHERE log_id = ?").run("{bad-json", first.id);
    assert.equal((await repository.getModelCallLog(first.id))?.requestMessages, undefined);
    assert.equal(await repository.deleteModelCallLogsBefore("2026-08-14T10:00:30.000Z"), 1);
    assert.equal(await repository.getModelCallLog(first.id), undefined);
  } finally {
    db.close();
    cleanup();
  }
});
