import assert from "node:assert/strict";
import test from "node:test";

import {
  LlmProviderProtocol,
  createComfyUiSettings,
  createLlmProviderProfile,
} from "../../domain/src/index.ts";
import { createInMemoryRepositories } from "./index.ts";

const timestamp = "2026-08-09T00:00:00.000Z";

function profile(id: string, isActive = false) {
  return createLlmProviderProfile({
    id,
    name: `Provider ${id}`,
    protocol: LlmProviderProtocol.OPENAI_COMPATIBLE,
    baseUrl: "https://llm.example.test/v1",
    model: "example-model",
    encryptedApiKey: "encrypted-key",
    encryptionIv: "encryption-iv",
    isActive,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function comfySettings() {
  return createComfyUiSettings({
    id: "default",
    baseUrl: "https://comfy.example.test",
    defaultWorkflowVersion: "workflow@v1",
    autoImageIntentEnabled: true,
    updatedAt: timestamp,
  });
}

test("in-memory integration repositories isolate saved and returned values", async () => {
  const savedProfile = profile("profile-copy", true);
  const savedSettings = comfySettings();
  const repositories = createInMemoryRepositories();
  const profiles = repositories.llmProviderProfiles;
  const comfy = repositories.comfyUiSettings;
  assert.ok(profiles && comfy);
  await profiles.save(savedProfile);
  await comfy.save(savedSettings);

  savedProfile.name = "mutated saved value";
  savedSettings.baseUrl = "https://mutated-saved-value.example.test";
  assert.equal((await profiles.getById("profile-copy"))?.name, "Provider profile-copy");
  assert.equal((await comfy.get())?.baseUrl, "https://comfy.example.test");

  const fetchedProfile = await profiles.getById("profile-copy");
  const fetchedSettings = await comfy.get();
  assert.ok(fetchedProfile && fetchedSettings);
  fetchedProfile.name = "mutated result";
  fetchedSettings.baseUrl = "https://mutated-result.example.test";
  assert.equal((await profiles.getById("profile-copy"))?.name, "Provider profile-copy");
  assert.equal((await comfy.get())?.baseUrl, "https://comfy.example.test");
});

test("in-memory LLM profiles enforce one active record and support list, lookup, and deletion", async () => {
  const repositories = createInMemoryRepositories();
  const profiles = repositories.llmProviderProfiles;
  assert.ok(profiles);
  const active = profile("active", true);
  const inactive = profile("inactive");
  await profiles.save(active);
  await profiles.save(inactive);

  assert.deepEqual((await profiles.list()).map((item) => item.id), ["active", "inactive"]);
  assert.deepEqual(await profiles.getActive(), active);
  assert.deepEqual(await profiles.getById(inactive.id), inactive);
  await profiles.save(profile("second-active", true));
  assert.equal((await profiles.getActive())?.id, "second-active");
  assert.equal((await profiles.getById(active.id))?.isActive, false);

  await profiles.delete("second-active");
  assert.equal(await profiles.getById("second-active"), undefined);
  assert.equal(await profiles.getActive(), undefined);
});

test("in-memory ComfyUI settings retain a default singleton", async () => {
  const repositories = createInMemoryRepositories();
  const comfy = repositories.comfyUiSettings;
  assert.ok(comfy);
  assert.equal(await comfy.get(), undefined);
  const settings = comfySettings();
  await comfy.save(settings);
  await comfy.save({ ...settings, timeoutMs: 45_000, updatedAt: "2026-08-09T00:01:00.000Z" });
  assert.equal((await comfy.get())?.timeoutMs, 45_000);
  await assert.rejects(
    comfy.save({ ...settings, id: "not-default" }),
    /ComfyUI settings id must be default/,
  );
});
