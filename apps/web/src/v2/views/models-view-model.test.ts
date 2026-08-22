import assert from "node:assert/strict";
import test from "node:test";

import type { V2PlatformCapabilities } from "@living-network/contracts/v2";
import { V2PlatformClientError } from "../adapters/platform.ts";
import {
  buildCapabilityBindingRows,
  buildCapabilityRuntimeItems,
  buildModelProfileSummaries,
  connectionLabel,
  connectionTone,
  formatCapabilityToggleError,
  modalityLabel,
  MODEL_PRESETS,
  providerLabel,
} from "./models-view-model.ts";

function capabilities(overrides: Partial<{ sceneEnabled: boolean; sceneConfigured: boolean; sceneConnection: string; assetEnabled: boolean; assetConfigured: boolean; assetConnection: string }> = {}): V2PlatformCapabilities {
  return {
    sceneGeneration: {
      enabled: overrides.sceneEnabled ?? false,
      configured: overrides.sceneConfigured ?? false,
      configuration: "incomplete",
      binding: "unbound",
      connection: (overrides.sceneConnection ?? "untested") as never,
      source: "none",
    },
    assetGeneration: {
      enabled: overrides.assetEnabled ?? false,
      configured: overrides.assetConfigured ?? false,
      configuration: "incomplete",
      binding: "not-applicable",
      connection: (overrides.assetConnection ?? "untested") as never,
      source: "none",
    },
  };
}

test("models view model distinguishes capability runtime states", () => {
  assert.deepEqual(buildCapabilityRuntimeItems(null, []), []);

  const items = buildCapabilityRuntimeItems(capabilities({
    sceneEnabled: true,
    sceneConfigured: true,
    sceneConnection: "ok",
    assetEnabled: true,
    assetConfigured: false,
  }), [
    { capability: "scene_generation", profileId: "profile:one", profileName: "GPT-5.6 Sol" },
  ]);

  assert.equal(items[0]?.name, "场景生成");
  assert.equal(items[0]?.enabled, true);
  assert.equal(items[0]?.modelLabel, "GPT-5.6 Sol");
  assert.equal(items[0]?.statusLabel, "连接正常");
  assert.equal(items[0]?.statusTone, "success");

  assert.equal(items[1]?.name, "素材生成");
  assert.equal(items[1]?.enabled, true);
  assert.equal(items[1]?.modelLabel, "未配置");
  assert.equal(items[1]?.statusLabel, "未配置");
  assert.equal(items[1]?.statusTone, "warning");
});

test("models view model maps connections, providers, modalities, and bindings", () => {
  assert.equal(connectionLabel("ok"), "连接正常");
  assert.equal(connectionLabel("failed"), "连接失败");
  assert.equal(connectionLabel(undefined), "未测试");
  assert.equal(connectionTone("ok"), "success");
  assert.equal(connectionTone("failed"), "danger");

  assert.equal(providerLabel("anthropic"), "Anthropic");
  assert.equal(providerLabel("openai-compatible"), "OpenAI 兼容");
  assert.equal(modalityLabel(["text", "image"]), "文本 / 图片");
  assert.equal(modalityLabel(undefined), "文本");

  const rows = buildCapabilityBindingRows([{ capability: "scene_generation", profileId: "profile:one", profileName: "Writer" }]);
  assert.deepEqual(rows.map((row) => row.capability), ["chat", "scene_generation", "memory", "story_analysis"]);
  assert.equal(rows.find((row) => row.capability === "chat")?.modelLabel, "未绑定");
  assert.equal(rows.find((row) => row.capability === "scene_generation")?.modelLabel, "Writer");
});

test("models view model summarizes profiles and formats toggle errors", () => {
  const summaries = buildModelProfileSummaries([
    {
      id: "profile:one",
      name: "GPT-5.6 Sol",
      protocol: "openai-compatible",
      baseUrl: "https://llm.example",
      model: "gpt-5.6-sol",
      timeoutMs: 30000,
      maxTokens: 4096,
      temperature: 0.2,
      inputModalities: ["text", "image"],
      hasApiKey: true,
      createdAt: "now",
      updatedAt: "now",
    },
  ]);
  assert.equal(summaries[0]?.providerLabel, "OpenAI 兼容");
  assert.equal(summaries[0]?.modalityLabel, "文本 / 图片");
  assert.equal(summaries[0]?.hasApiKey, true);

  assert.equal(formatCapabilityToggleError(new V2PlatformClientError("CAPABILITY_DISABLED", "scene generation is disabled", 409)), "该能力当前已关闭。");
  assert.equal(formatCapabilityToggleError(new V2PlatformClientError("MODEL_NOT_BOUND", "scene generation is not configured", 503)), "尚未为该能力配置模型。");
  assert.equal(formatCapabilityToggleError(new V2PlatformClientError("VALIDATION_FAILED", "bad input", 422)), "VALIDATION_FAILED: bad input");
  assert.equal(formatCapabilityToggleError(new Error("boom")), "boom");
  assert.equal(formatCapabilityToggleError(null, "fallback"), "fallback");
});

test("models view model exposes standard model presets with valid configs", () => {
  assert.ok(MODEL_PRESETS.length >= 5);
  const deepseek = MODEL_PRESETS.find((p) => p.id === "deepseek-v3");
  assert.ok(deepseek);
  assert.equal(deepseek.protocol, "openai-compatible");
  assert.ok(deepseek.baseUrl.includes("deepseek.com"));
  assert.ok(deepseek.maxTokens.length > 0);
});
