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
  await expect(page.locator("article.state-card", { hasText: "e2e_flag" })).toBeVisible();
  await page.locator("article.state-card", { hasText: "e2e_flag" }).getByRole("button", { name: "编辑状态变量" }).click();
  await page.getByLabel("默认值").fill("false");
  await page.getByRole("button", { name: "保存变量", exact: true }).click();
  await expect(page.locator("article.state-card", { hasText: "e2e_flag" }).getByText(/默认值：false/)).toBeVisible();

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
  await expect(page.locator("article.state-card", { hasText: "mobile_flag" })).toBeVisible();

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

test("V2 HTTP workspace persists reviewed candidates across a browser refresh", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("living-network-v2-adapter", "http");
  });
  await page.goto("/v2/workspace/canon");
  await expect(page.getByRole("heading", { name: "还没有故事世界" })).toBeVisible();

  await page.getByRole("button", { name: "新建故事", exact: true }).click();
  await page.getByLabel("故事名称").fill("HTTP E2E World");
  await page.getByLabel("故事前提 / 世界观背景").last().fill("真实 API 与 SQLite 驱动的浏览器验收。");
  await page.getByRole("button", { name: "创建故事", exact: true }).click();
  await expect(page.getByLabel("故事空间名称")).toHaveValue("HTTP E2E World");

  const worldsResponse = await page.request.get("/api/v2/core/worlds");
  expect(worldsResponse.ok()).toBeTruthy();
  const worlds = await worldsResponse.json() as Array<{ storyWorldId: string; name: string; revision: number }>;
  const world = worlds.find((item) => item.name === "HTTP E2E World");
  expect(world).toBeTruthy();

  const candidateId = "candidate_http_e2e";
  const candidateResponse = await page.request.post(
    `/api/v2/core/worlds/${encodeURIComponent(world!.storyWorldId)}/candidates/scenes`,
    {
      data: {
        candidateId,
        baseCanonRevision: world!.revision,
        payload: {
          scene: {
            sceneId: "scene_http_e2e",
            title: "HTTP Persisted Scene",
            body: "This scene crossed the real HTTP and SQLite boundary.",
            participantCharacterIds: [],
          },
          choices: [{ label: "Remain in the persisted scene" }],
          validationNotes: [],
        },
        provenance: { source: "human", summary: "Playwright real API candidate" },
        idempotencyKey: "candidate-http-e2e",
      },
    },
  );
  expect(candidateResponse.status()).toBe(201);

  await navigateTo(page, "候选审核");
  await page.getByRole("button", { name: "刷新状态", exact: true }).click();
  await expect(page.getByText("HTTP Persisted Scene", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "通过", exact: true }).click();
  await expect(page.getByText("候选内容已通过。", { exact: true })).toBeVisible();

  await page.reload();
  await navigateTo(page, "故事结构");
  await expect(page.getByRole("heading", { name: "HTTP Persisted Scene", exact: true })).toBeVisible();

  const persistedCandidate = await page.request.get(
    `/api/v2/core/worlds/${encodeURIComponent(world!.storyWorldId)}/candidates/scenes/${candidateId}`,
  );
  expect(persistedCandidate.ok()).toBeTruthy();
  expect((await persistedCandidate.json() as { status: string }).status).toBe("approved");
});
