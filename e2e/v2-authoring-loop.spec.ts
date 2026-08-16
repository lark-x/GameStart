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

test("V2 authoring loop completes at 1440px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/v2/workspace/graph");
  await expect(page.getByRole("heading", { name: "故事结构图 (Scene Graph)" })).toBeVisible();

  // Add Arc
  await page.getByRole("button", { name: "新增 Arc", exact: true }).click();
  await page.getByLabel("Arc 标题").fill("E2E Arc");
  await page.getByLabel("Arc 摘要").fill("E2E arc summary");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("E2E Arc", { exact: true })).toBeVisible();

  // Add Scene with Arc ownership and body
  await page.getByRole("button", { name: "新增场景", exact: true }).click();
  await page.getByLabel("场景标题").fill("E2E Scene");
  await page.getByLabel("场景正文").fill("E2E scene body");
  await page.getByLabel("Arc 归属").selectOption({ label: "E2E Arc" });
  await page.getByLabel("入口场景").selectOption("true");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("E2E Scene", { exact: true })).toBeVisible();

  // Add Choice with gates and consequences
  await page.getByRole("button", { name: "新增选项", exact: true }).click();
  await page.getByLabel("选项文本").fill("E2E Choice");
  await page.getByLabel("源场景").selectOption({ label: "E2E Scene" });
  await page.getByRole("button", { name: "添加条件", exact: true }).click();
  await page.getByLabel("条件状态变量").fill("trust_archivist");
  await page.getByLabel("条件值").fill("1");
  await page.getByRole("button", { name: "添加后果", exact: true }).click();
  await page.getByLabel("后果状态变量").fill("trust_archivist");
  await page.getByLabel("后果值").fill("1");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("E2E Choice", { exact: true })).toBeVisible();

  // Add and edit State Variable
  await navigateTo(page, "状态变量");
  await page.getByRole("button", { name: "新增变量", exact: true }).click();
  await page.getByLabel("变量 key").fill("e2e_flag");
  await page.getByLabel("类型").selectOption("boolean");
  await page.getByLabel("默认值").fill("true");
  await page.getByRole("button", { name: "保存变量", exact: true }).click();
  await expect(page.getByText("e2e_flag", { exact: true })).toBeVisible();
  await page.locator("article.state-card", { hasText: "e2e_flag" }).getByRole("button", { name: "编辑默认值" }).click();
  await page.getByLabel("默认值").fill("false");
  await page.getByRole("button", { name: "保存变量", exact: true }).click();
  await expect(page.locator("article.state-card", { hasText: "e2e_flag" }).getByText("false", { exact: true })).toBeVisible();

  // Add and edit Timeline Event
  await navigateTo(page, "故事总览");
  await page.getByRole("button", { name: /时间线/ }).first().click();
  await page.getByRole("button", { name: "新增正典数据", exact: true }).click();
  await page.getByLabel("数据类型").selectOption("timeline");
  await page.getByLabel("事件标题").fill("E2E Timeline");
  await page.getByLabel("日期").fill("2088-02-02");
  await page.getByLabel("说明").fill("E2E timeline summary");
  await page.getByRole("button", { name: "保存数据", exact: true }).click();
  await expect(page.getByText("E2E Timeline", { exact: true })).toBeVisible();
});

test("V2 authoring loop completes at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/v2/workspace/graph");
  await expect(page.getByRole("heading", { name: "故事结构图 (Scene Graph)" })).toBeVisible();

  // Add Arc
  await page.getByRole("button", { name: "新增 Arc", exact: true }).click();
  await page.getByLabel("Arc 标题").fill("Mobile Arc");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("Mobile Arc", { exact: true })).toBeVisible();

  // Add Scene
  await page.getByRole("button", { name: "新增场景", exact: true }).click();
  await page.getByLabel("场景标题").fill("Mobile Scene");
  await page.getByLabel("场景正文").fill("Mobile scene body");
  await page.getByLabel("Arc 归属").selectOption({ label: "Mobile Arc" });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("Mobile Scene", { exact: true })).toBeVisible();

  // Add Choice
  await page.getByRole("button", { name: "新增选项", exact: true }).click();
  await page.getByLabel("选项文本").fill("Mobile Choice");
  await page.getByLabel("源场景").selectOption({ label: "Mobile Scene" });
  await page.getByRole("button", { name: "添加后果", exact: true }).click();
  await page.getByLabel("后果状态变量").fill("trust_archivist");
  await page.getByLabel("后果值").fill("1");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("Mobile Choice", { exact: true })).toBeVisible();

  // Add State Variable
  await navigateTo(page, "状态变量");
  await page.getByRole("button", { name: "新增变量", exact: true }).click();
  await page.getByLabel("变量 key").fill("mobile_flag");
  await page.getByLabel("类型").selectOption("number");
  await page.getByLabel("默认值").fill("0");
  await page.getByRole("button", { name: "保存变量", exact: true }).click();
  await expect(page.getByText("mobile_flag", { exact: true })).toBeVisible();

  // Add Timeline Event
  await navigateTo(page, "故事总览");
  await page.getByRole("button", { name: /时间线/ }).first().click();
  await page.getByRole("button", { name: "新增正典数据", exact: true }).click();
  await page.getByLabel("数据类型").selectOption("timeline");
  await page.getByLabel("事件标题").fill("Mobile Timeline");
  await page.getByLabel("日期").fill("2088-03-03");
  await page.getByRole("button", { name: "保存数据", exact: true }).click();
  await expect(page.getByText("Mobile Timeline", { exact: true })).toBeVisible();

  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});
