import { expect, test, type Page } from "@playwright/test";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2e3VwAAAABJRU5ErkJggg==",
  "base64",
);

async function openNavigation(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "打开平台导航" });
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await expect(page.getByRole("navigation", { name: "平台模块" })).toBeVisible();
  }
}

async function navigateTo(page: Page, label: string): Promise<void> {
  await openNavigation(page);
  const navigation = page.getByRole("navigation", { name: "平台模块" });
  await navigation.getByRole("link", { name: label, exact: true }).click();
}

async function createStory(page: Page, name: string): Promise<void> {
  await page.goto("/v2/workspace/world");
  await expect(page.getByRole("button", { name: "新建故事", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新建故事", exact: true }).click();
  await page.getByLabel("故事名称").fill(name);
  await page.getByLabel("故事前提 / 世界观背景").fill("真实 API 与 SQLite 驱动的浏览器创作闭环。");
  await page.getByRole("button", { name: "创建故事", exact: true }).click();
  await expect(page.getByLabel("故事空间名称")).toHaveValue(name);
}

test("V2 completes the manual authoring loop against the real API", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const storyName = `HTTP E2E World ${Date.now()}`;
  await createStory(page, storyName);

  await navigateTo(page, "状态与逻辑");
  await page.getByRole("button", { name: "新增变量", exact: true }).click();
  await page.getByLabel("变量 key").fill("trust_e2e");
  await page.getByLabel("变量类型").selectOption("number");
  await page.getByLabel("默认值").fill("1");
  await page.getByRole("button", { name: "保存变量", exact: true }).click();
  await expect(page.locator("article.state-card", { hasText: "trust_e2e" })).toBeVisible();

  await navigateTo(page, "故事结构");
  await page.getByRole("button", { name: "新增 Arc", exact: true }).click();
  await page.getByLabel("Arc 标题").fill("E2E Arc");
  await page.getByLabel("Arc 摘要").fill("E2E arc summary");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("E2E Arc", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "新增场景", exact: true }).click();
  await page.getByLabel("场景标题").fill("E2E Entry Scene");
  await page.getByLabel("场景正文").fill("E2E entry body");
  await page.getByLabel("Arc 归属").selectOption({ label: "E2E Arc" });
  await page.getByLabel("入口场景").selectOption("true");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("heading", { name: "E2E Entry Scene", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "新增场景", exact: true }).click();
  await page.getByLabel("场景标题").fill("E2E Next Scene");
  await page.getByLabel("场景正文").fill("E2E next body");
  await page.getByLabel("Arc 归属").selectOption({ label: "E2E Arc" });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("E2E Next Scene", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "新增选项", exact: true }).click();
  await page.getByLabel("源场景").selectOption({ label: "E2E Entry Scene" });
  await page.getByLabel("目标场景").selectOption({ label: "E2E Next Scene" });
  await page.getByLabel("选项文本").fill("E2E Choice");
  await page.getByRole("button", { name: "添加条件", exact: true }).click();
  await page.getByLabel("条件状态变量").selectOption("trust_e2e");
  await page.getByLabel("条件值").fill("1");
  await page.getByRole("button", { name: "添加后果", exact: true }).click();
  await page.getByLabel("后果状态变量").selectOption("trust_e2e");
  await page.getByLabel("后果值").fill("2");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("E2E Choice", { exact: true })).toBeVisible();

  await navigateTo(page, "正式素材库");
  await page.getByLabel("素材名称").fill("E2E Bridge Reference");
  await page.locator('input[type="file"]').setInputFiles({
    name: "bridge.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await page.getByRole("button", { name: "上传到正式素材库", exact: true }).click();
  await expect(page.getByText("E2E Bridge Reference", { exact: true })).toBeVisible();
  await expect(page.getByText("人工上传", { exact: true })).toBeVisible();

  await navigateTo(page, "发布检查");
  await expect(page.getByText("结构校验通过", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "创建发布版本", exact: true }).click();
  await expect(page.getByText(/发布包：/)).toBeVisible();
  await page.getByRole("button", { name: "启动运行预览", exact: true }).click();

  await navigateTo(page, "运行预览");
  await expect(page.locator(".scene-title-tag").filter({ hasText: /^E2E Entry Scene$/ })).toBeVisible();
  await page.getByRole("button", { name: "E2E Choice" }).click();
  await expect(page.locator(".scene-title-tag").filter({ hasText: /^E2E Next Scene$/ })).toBeVisible();
  await page.getByLabel("存档名称").fill("E2E checkpoint");
  await page.getByRole("button", { name: "保存运行", exact: true }).click();
  await expect(page.getByText(/E2E checkpoint/)).toBeVisible();
  await page.getByRole("button", { name: "恢复存档", exact: true }).click();
  await expect(page.locator(".scene-title-tag").filter({ hasText: /^E2E Next Scene$/ })).toBeVisible();

  await navigateTo(page, "导出");
  await page.getByLabel("导出格式").selectOption("markdown");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await expect(page.getByText(/已准备导出文件：/)).toBeVisible();

  await page.reload();
  await navigateTo(page, "项目首页");
  await expect(page.getByRole("heading", { name: storyName, exact: true })).toBeVisible();
  await expect(page.getByText("2 场景", { exact: true })).toBeVisible();
  await expect(page.getByText("1 个资产", { exact: true })).toBeVisible();
});
