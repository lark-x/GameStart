import { expect, test } from "@playwright/test";

async function createInstantStory(page: import("@playwright/test").Page, persona: string): Promise<string> {
  await page.goto("/v2/start");
  await page.getByLabel("角色人设").fill(persona);
  await page.getByRole("button", { name: "开始故事", exact: true }).click();
  await page.waitForURL(/\/v2\/chat\//);
  await expect(page.getByRole("heading", { name: /花火|故事对话/ })).toBeVisible();
  return page.url();
}

test("V2 chat renders a single-scroll full-height layout without developer ids", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const url = await createInstantStory(page, "花火是爱笑的角色。");

  // The raw conversation id must not be rendered in the page body.
  const conversationId = /conversation%3Ainstant%3A[a-f0-9]+/.exec(url)?.[0];
  expect(conversationId).toBeTruthy();
  await expect(page.getByText(conversationId!.replaceAll("%3A", ":"), { exact: true })).toHaveCount(0);

  // The messages container is the only scrollable region of the chat page.
  const messages = page.locator(".v2-chat-messages");
  await expect(messages).toBeVisible();
  const overflow = await messages.evaluate((el) => getComputedStyle(el).overflowY);
  expect(overflow).toBe("auto");

  // Composer is fixed at the bottom with a compact textarea.
  await expect(page.locator(".v2-chat-composer")).toBeVisible();
  await expect(page.locator(".ui-textarea-composer")).toBeVisible();
});

test("V2 chat more menu exposes diagnostics drawer and conversation id copy", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createInstantStory(page, "花火是爱笑的角色。");

  await page.getByRole("button", { name: "更多操作" }).click();
  await expect(page.getByRole("menuitem", { name: /上下文诊断/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /复制会话 ID/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /提炼剧情/ })).toBeVisible();

  await page.getByRole("menuitem", { name: /上下文诊断/ }).click();
  await expect(page.getByRole("dialog", { name: "上下文诊断面板" })).toBeVisible();
  await page.getByRole("button", { name: "关闭诊断面板" }).click();
  await expect(page.getByRole("dialog", { name: "上下文诊断面板" })).toHaveCount(0);
});

test("V2 start page hides conversation ids in recent stories", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createInstantStory(page, "花火是爱笑的角色。");

  await page.goto("/v2/start");
  const recent = page.locator(".v2-recent-card");
  await expect(recent).toBeVisible();
  await expect(recent.getByText(/conversation:instant:/)).toHaveCount(0);
  const recentLink = recent.getByRole("link").first();
  await expect(recentLink).toBeVisible();
  await expect(recentLink).toContainText("继续");
});
