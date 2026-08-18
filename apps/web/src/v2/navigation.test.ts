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

  // Check key routes
  assert.ok(paths.has(""), "Default redirect exists");
  assert.ok(paths.has("start"), "Start view exists");
  assert.ok(paths.has("chat/:conversationId"), "Chat view exists");
  assert.ok(paths.has("workspace/:area"), "Workspace area view exists");
  assert.ok(paths.has("settings"), "Settings home exists");
  assert.ok(paths.has("services/models"), "Models settings exists");
  assert.ok(paths.has("services/comfyui"), "ComfyUI settings exists");
  assert.ok(paths.has("services/runtime"), "Runtime status exists");

  // Check aliases/redirects
  const reviewRedirect = paths.get("workspace/review");
  assert.equal(reviewRedirect?.redirect, "/v2/workspace/ai-scene-review");

  const modelsRedirect = paths.get("settings/models");
  assert.equal(modelsRedirect?.redirect, "/v2/services/models");

  const imageRedirect = paths.get("settings/image");
  assert.equal(imageRedirect?.redirect, "/v2/services/comfyui");
});
