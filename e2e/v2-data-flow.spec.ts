import { expect, test, type Page } from "@playwright/test";

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
  await page.getByRole("button", { name: "创建故事", exact: true }).click();
  await expect(page.getByLabel("故事空间名称")).toHaveValue(name);
}

test("V2 data flow shows truthful pipelines and review boundary", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const storyName = `DataFlow E2E ${Date.now()}`;
  await createStory(page, storyName);

  await page.goto("/v2/workspace/data-flow");
  await expect(page.getByRole("heading", { name: "数据流程 (Data Flow)" })).toBeVisible();

  // Scene Generation filter shows the full pipeline including Review.
  await page.getByRole("button", { name: "场景生成", exact: true }).click();
  await expect(page.getByText("生成上下文", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("场景候选", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("场景审核", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("正式场景图", { exact: false }).first()).toBeVisible();

  // Open Scene Candidate drawer: it must show review as its next step.
  await page.getByRole("button", { name: /场景候选/ }).first().click();
  await expect(page.getByText("输出去向", { exact: true })).toBeVisible();
  await expect(page.getByText("场景审核", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "关闭编辑面板" }).click();

  // Player filter must show Release Manifest -> Player Runtime.
  await page.getByRole("button", { name: "Player", exact: true }).click();
  await expect(page.getByText("发布清单", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("玩家运行时", { exact: false }).first()).toBeVisible();
});

test("V2 data flow character node links to canon management", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const storyName = `DataFlow Char ${Date.now()}`;
  await createStory(page, storyName);

  await page.goto("/v2/workspace/data-flow");
  await expect(page.getByRole("heading", { name: "数据流程 (Data Flow)" })).toBeVisible();
  await page.getByRole("button", { name: /角色名称/ }).first().click();
  await expect(page.getByText("管理配置", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "管理配置", exact: true }).click();
  await expect(page).toHaveURL(/\/v2\/workspace\/world\?tab=characters$/);
});
