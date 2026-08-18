import assert from "node:assert/strict";
import test from "node:test";
import type { ModuleTab } from "./ModuleTabs.vue";

test("ModuleTab contract supports labels, routes, and optional badges", () => {
  const storyTabs: readonly ModuleTab[] = [
    { label: "总览", to: "/v2/workspace/project", exact: true },
    { label: "世界设定", to: "/v2/workspace/world" },
    { label: "状态与逻辑", to: "/v2/workspace/state" },
    { label: "故事结构", to: "/v2/workspace/story" },
  ];

  assert.equal(storyTabs.length, 4);
  assert.equal(storyTabs[0]?.label, "总览");
  assert.equal(storyTabs[0]?.to, "/v2/workspace/project");
  assert.equal(storyTabs[0]?.exact, true);
  assert.equal(storyTabs[1]?.label, "世界设定");
});

test("Creation and Asset ModuleTabs correctly partition AI scene vs ComfyUI", () => {
  const creationTabs: readonly ModuleTab[] = [
    { label: "创建", to: "/v2/workspace/ai-scene-request" },
    { label: "任务", to: "/v2/workspace/ai-scene-jobs" },
    { label: "审核", to: "/v2/workspace/ai-scene-review", badge: 2 },
  ];
  assert.equal(creationTabs.length, 3);
  assert.equal(creationTabs[2]?.badge, 2);

  const assetTabs: readonly ModuleTab[] = [
    { label: "素材库", to: "/v2/workspace/formal-assets" },
    { label: "图片生成", to: "/v2/workspace/comfy-request" },
    { label: "任务", to: "/v2/workspace/comfy-jobs" },
    { label: "审核", to: "/v2/workspace/comfy-review" },
  ];
  assert.equal(assetTabs.length, 4);
});
