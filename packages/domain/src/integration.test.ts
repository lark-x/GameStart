import assert from "node:assert/strict";
import test from "node:test";
import {
  LlmProviderProtocol,
  assertLlmProviderProfile,
  assertComfyUiSettings,
  createLlmProviderProfile,
  createComfyUiSettings,
  type LlmProviderProfile,
  type ComfyUiSettings,
} from "./integration.ts";

const validProfile: LlmProviderProfile = {
  id: "p1",
  name: "test",
  protocol: LlmProviderProtocol.OPENAI_COMPATIBLE,
  baseUrl: "https://api.test.com",
  model: "gpt-4",
  timeoutMs: 30_000,
  maxTokens: 800,
  temperature: 0.8,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("assertLlmProviderProfile accepts valid profile", () => {
  assertLlmProviderProfile(validProfile);
});

test("assertLlmProviderProfile rejects invalid baseUrl", () => {
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, baseUrl: "" }), TypeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, baseUrl: "not-a-url" }), TypeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, baseUrl: "ftp://host" }), TypeError);
});

test("assertLlmProviderProfile rejects invalid protocol", () => {
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, protocol: "INVALID" as LlmProviderProtocol }), TypeError);
});

test("assertLlmProviderProfile rejects invalid timeoutMs and maxTokens", () => {
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, timeoutMs: 0 }), RangeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, timeoutMs: -1 }), RangeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, timeoutMs: 1.5 }), RangeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, timeoutMs: 700_000 }), RangeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, maxTokens: 0 }), RangeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, maxTokens: 200_000 }), RangeError);
});

test("assertLlmProviderProfile rejects invalid temperature", () => {
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, temperature: -0.1 }), RangeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, temperature: 2.1 }), RangeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, temperature: NaN }), RangeError);
});

test("assertLlmProviderProfile rejects mismatched encryption fields", () => {
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, encryptedApiKey: "key" }), TypeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, encryptionIv: "iv" }), TypeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, encryptedApiKey: "", encryptionIv: "iv" }), TypeError);
  assert.throws(() => assertLlmProviderProfile({ ...validProfile, encryptedApiKey: "key", encryptionIv: "" }), TypeError);
});

test("createLlmProviderProfile applies defaults and validates", () => {
  const profile = createLlmProviderProfile({
    id: "p1", name: "test", protocol: LlmProviderProtocol.OPENAI_COMPATIBLE,
    baseUrl: "https://api.test.com", model: "gpt-4",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(profile.timeoutMs, 30_000);
  assert.equal(profile.maxTokens, 800);
  assert.equal(profile.temperature, 0.8);
  assert.equal(profile.isActive, false);
});

test("createLlmProviderProfile preserves encryption fields", () => {
  const profile = createLlmProviderProfile({
    id: "p1", name: "test", protocol: LlmProviderProtocol.ANTHROPIC,
    baseUrl: "https://api.test.com", model: "claude",
    encryptedApiKey: "enc", encryptionIv: "iv",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(profile.encryptedApiKey, "enc");
  assert.equal(profile.encryptionIv, "iv");
});

const validComfy: ComfyUiSettings = {
  id: "c1",
  baseUrl: "http://localhost:8188",
  timeoutMs: 30_000,
  autoImageIntentEnabled: true,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("assertComfyUiSettings accepts valid settings", () => {
  assertComfyUiSettings(validComfy);
});

test("assertComfyUiSettings rejects invalid fields", () => {
  assert.throws(() => assertComfyUiSettings({ ...validComfy, baseUrl: "" }), TypeError);
  assert.throws(() => assertComfyUiSettings({ ...validComfy, baseUrl: "ftp://host" }), TypeError);
  assert.throws(() => assertComfyUiSettings({ ...validComfy, timeoutMs: 0 }), RangeError);
  assert.throws(() => assertComfyUiSettings({ ...validComfy, defaultWorkflowVersion: "" }), TypeError);
});

test("createComfyUiSettings applies defaults", () => {
  const settings = createComfyUiSettings({
    id: "c1", baseUrl: "http://localhost:8188",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(settings.timeoutMs, 30_000);
  assert.equal(settings.autoImageIntentEnabled, false);
  assert.equal(settings.defaultWorkflowVersion, undefined);
});
