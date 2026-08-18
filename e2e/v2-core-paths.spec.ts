import { expect, test } from "@playwright/test";

test("V2 redirects legacy entry and exposes the feature-first module map", async ({ page }) => {
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/v2\/workspace\/project$/);

  const navigation = page.getByRole("navigation", { name: "平台模块" });
  for (const group of ["故事", "创作", "发布", "系统"]) {
    await expect(navigation.getByRole("button", { name: group, exact: true })).toBeVisible();
  }

  for (const label of [
    "项目首页",
    "故事切换",
    "世界设定",
    "状态与逻辑",
    "故事结构",
    "正式素材库",
    "场景候选审核",
    "素材候选审核",
    "发布检查",
    "运行预览",
    "模型",
    "ComfyUI 服务",
    "调用日志",
    "运行状态",
  ]) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  await page.goto("/v2/workspace/review");
  await expect(page).toHaveURL(/\/v2\/workspace\/ai-scene-review$/);
  await expect(page.getByText("模型 隔离模块", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "候选审核", exact: true })).toBeVisible();

  await page.goto("/v2/workspace/stories");
  await expect(page.getByRole("heading", { name: "创建第一条故事数据", exact: true })).toBeVisible();
});

test("V2 keeps external service configuration outside manual authoring pages", async ({ page }) => {
  await page.goto("/v2/workspace/world");
  await expect(page.getByRole("heading", { name: /还没有故事世界|正典修订与设定基线/ })).toBeVisible();
  await expect(page.getByLabel("API 地址")).toHaveCount(0);
  await expect(page.getByLabel("ComfyUI 地址")).toHaveCount(0);

  await page.goto("/v2/services/models");
  await expect(page.getByRole("heading", { name: "模型与能力" }).first()).toBeVisible();
  await expect(page.getByText("当前运行能力", { exact: true })).toBeVisible();
  await page.getByLabel("档案名称").fill("本地测试模型");
  await page.getByLabel("API 地址").fill("https://example.invalid/v1");
  await page.getByLabel("模型名称").fill("test-model");
  await page.getByRole("button", { name: "保存档案", exact: true }).click();
  await expect(page.getByText("模型档案“本地测试模型”已保存。", { exact: true })).toBeVisible();

  await page.goto("/v2/services/comfyui");
  await expect(page.getByRole("heading", { name: "图片服务" }).first()).toBeVisible();
  await page.getByLabel("ComfyUI 地址").fill("http://127.0.0.1:8188");
  await page.getByLabel("默认工作流版本").fill("local-default@1");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.getByText("图片服务设置已保存。Worker 会在下一次任务执行时读取。", { exact: true })).toBeVisible();

  await page.goto("/v2/services/logs");
  await expect(page.getByRole("heading", { name: "调用日志" }).first()).toBeVisible();

  await page.goto("/v2/services/runtime");
  await expect(page.getByRole("heading", { name: "运行状态" }).first()).toBeVisible();
});
