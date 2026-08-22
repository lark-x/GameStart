import assert from "node:assert/strict";
import test from "node:test";
import { v2Routes } from "./index.ts";

test("V2 routes structure correctly configures entry points and redirects", () => {
  const root = v2Routes[0];
  assert.ok(root, "Root /v2 route should exist");
  assert.equal(root.path, "/v2");
  assert.equal(root.meta?.v2Shell, true);

  const children = root.children ?? [];
  const paths = new Map(children.map((c) => [c.path, c]));

  // Core navigation routes
  assert.ok(paths.has(""), "Default redirect exists");
  assert.ok(paths.has("start"), "Start view exists");
  assert.ok(paths.has("chat"), "Chat home view exists");
  assert.ok(paths.has("chat/:conversationId"), "Chat view exists");
  assert.ok(paths.has("companion"), "Companion view exists");
  assert.ok(paths.has("workspace/characters"), "Character center list view exists");
  assert.ok(paths.has("workspace/characters/:characterId"), "Character center detail view exists");
  assert.ok(paths.has("workspace/:area"), "Workspace area view exists");

  // Settings is a layout route with children
  const settingsRoute = paths.get("settings");
  assert.ok(settingsRoute, "Settings layout route exists");
  assert.equal(settingsRoute.name, "v2-settings");

  const settingsChildren = settingsRoute.children ?? [];
  const settingsPaths = new Map(settingsChildren.map((c) => [c.path, c]));

  // Canonical settings child routes
  assert.ok(settingsPaths.has(""), "Settings overview exists");
  assert.ok(settingsPaths.has("models"), "Settings models exists");
  assert.ok(settingsPaths.has("models/new"), "Settings new model exists");
  assert.ok(settingsPaths.has("models/:profileId"), "Settings model detail exists");
  assert.ok(settingsPaths.has("memory"), "Settings memory exists");
  assert.ok(settingsPaths.has("prompt"), "Settings prompt exists");
  assert.ok(settingsPaths.has("comfyui"), "Settings comfyui exists");
  assert.ok(settingsPaths.has("runtime"), "Settings runtime exists");
  assert.ok(settingsPaths.has("logs"), "Settings logs exists");
  assert.ok(settingsPaths.has("automation"), "Settings automation exists");
  assert.ok(settingsPaths.has("appearance"), "Settings appearance exists");

  // Legacy redirects point to canonical settings routes
  const servicesModels = paths.get("services/models");
  assert.equal(servicesModels?.redirect, "/v2/settings/models");

  const servicesComfyui = paths.get("services/comfyui");
  assert.equal(servicesComfyui?.redirect, "/v2/settings/comfyui");

  const servicesRuntime = paths.get("services/runtime");
  assert.equal(servicesRuntime?.redirect, "/v2/settings/runtime");

  const servicesLogs = paths.get("services/logs");
  assert.equal(servicesLogs?.redirect, "/v2/settings/logs");

  const automationRedirect = paths.get("automation");
  assert.equal(automationRedirect?.redirect, "/v2/settings/automation");

  const diagnosticsRedirect = paths.get("diagnostics/model-logs");
  assert.equal(diagnosticsRedirect?.redirect, "/v2/settings/logs");

  // Workspace redirect
  const reviewRedirect = paths.get("workspace/review");
  assert.equal(reviewRedirect?.redirect, "/v2/workspace/ai-scene-review");
});
