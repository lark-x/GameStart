import { expect, test } from "@playwright/test";

test("V2 groups the creator workflow and completes the mock release loop", async ({ page }) => {
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/v2\/workspace\/canon$/);
  await expect(page.getByRole("heading", { name: "故事总览" }).first()).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "平台模块" });
  for (const label of ["故事总览", "故事结构", "候选审核", "素材工作台", "发布检查", "运行预览", "模型与能力", "图片服务", "外观主题", "模型调用日志", "触发器"]) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  await navigation.getByRole("link", { name: "候选审核", exact: true }).click();
  await page.getByRole("button", { name: "创建生成任务", exact: true }).click();
  await expect(page.getByText(/生成任务已创建/)).toBeVisible();
  await page.getByRole("button", { name: "通过", exact: true }).click();
  await expect(page.getByText("候选内容已通过。", { exact: true })).toBeVisible();

  await navigation.getByRole("link", { name: "素材工作台", exact: true }).click();
  await page.getByRole("button", { name: "创建素材任务", exact: true }).click();
  await page.getByRole("button", { name: "通过素材", exact: true }).click();
  await expect(page.getByText("素材候选已通过。", { exact: true })).toBeVisible();

  await navigation.getByRole("link", { name: "发布检查", exact: true }).click();
  await page.getByRole("button", { name: "创建发布版本", exact: true }).click();
  await page.getByRole("button", { name: "启动运行预览", exact: true }).click();

  await navigation.getByRole("link", { name: "运行预览", exact: true }).click();
  await page.getByRole("button", { name: "保存运行", exact: true }).click();
  await expect(page.getByText(/已保存“/)).toBeVisible();
  await page.getByRole("button", { name: "恢复存档", exact: true }).click();
  await expect(page.getByText(/已恢复“/)).toBeVisible();

  await navigation.getByRole("link", { name: "发布检查", exact: true }).click();
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await expect(page.getByText(/已准备导出文件：/)).toBeVisible();
});

test("V2 platform settings, diagnostics, and automation pages load on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/v2/settings");
  await expect(page.getByRole("heading", { name: "把系统配置集中在这里" })).toBeVisible();
  await expect(page.getByRole("link", { name: /模型与能力/ }).last()).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "平台模块" });
  const openNavigation = async (): Promise<void> => {
    await page.getByRole("button", { name: "打开平台导航" }).click();
    await expect(navigation).toBeVisible();
  };

  await openNavigation();
  await navigation.getByRole("link", { name: "模型与能力", exact: true }).click();
  await expect(page.getByRole("heading", { name: "模型与能力" }).first()).toBeVisible();
  await expect(page.getByText("当前运行能力", { exact: true })).toBeVisible();
  await page.getByLabel("档案名称").fill("本地测试模型");
  await page.getByLabel("API 地址").fill("https://example.invalid/v1");
  await page.getByLabel("模型名称").fill("test-model");
  await page.getByRole("button", { name: "保存档案", exact: true }).click();
  await expect(page.getByText("模型档案“本地测试模型”已保存。", { exact: true })).toBeVisible();

  await openNavigation();
  await navigation.getByRole("link", { name: "图片服务", exact: true }).click();
  await expect(page.getByRole("heading", { name: "图片服务" }).first()).toBeVisible();
  await expect(page.getByLabel("ComfyUI 地址")).toBeVisible();

  await openNavigation();
  await navigation.getByRole("link", { name: "外观主题", exact: true }).click();
  await expect(page.getByRole("heading", { name: "外观主题" }).first()).toBeVisible();
  const themePicker = page.locator('[aria-label="主题选择"]');
  await expect(themePicker).toBeVisible();
  await expect(themePicker.getByRole("button")).toHaveCount(6);
  for (const theme of ["暖阳", "夜幕", "樱语", "青野", "海盐", "星夜"]) {
    await themePicker.getByRole("button", { name: new RegExp(theme) }).click();
  }
  await page.getByRole("button", { name: "保存主题", exact: true }).click();
  await expect(page.getByText("外观主题已保存。", { exact: true })).toBeVisible();

  await openNavigation();
  await navigation.getByRole("link", { name: "模型调用日志", exact: true }).click();
  await expect(page.getByRole("heading", { name: "模型调用日志" }).first()).toBeVisible();
  await expect(page.getByText("最近请求", { exact: true })).toBeVisible();

  await openNavigation();
  await navigation.getByRole("link", { name: "触发器", exact: true }).click();
  await expect(page.getByRole("heading", { name: "触发器" }).first()).toBeVisible();
  await expect(page.getByText("触发器引擎尚未启用", { exact: true })).toBeVisible();

  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});
