import { expect, test } from "@playwright/test";

test("V2 model settings shows capability bindings summary and sectioned form", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/v2/services/models");

  // Binding summary lists all four capabilities.
  const summary = page.locator(".v2-binding-summary");
  await expect(summary).toBeVisible();
  for (const label of ["对话模型", "场景生成模型", "记忆模型", "剧情分析模型"]) {
    await expect(summary.getByText(label, { exact: true })).toBeVisible();
  }

  // New profile form is grouped into sections.
  await page.getByRole("button", { name: "新建档案", exact: true }).click();
  await expect(page.getByText("基础信息", { exact: true })).toBeVisible();
  await expect(page.getByText("连接", { exact: true })).toBeVisible();
  await expect(page.getByText("模型能力", { exact: true })).toBeVisible();

  // Capability binding selects exist per capability.
  for (const capability of ["chat", "scene_generation", "memory", "story_analysis"]) {
    await expect(page.locator(`#v2-binding-${capability}`)).toBeVisible();
  }
});
