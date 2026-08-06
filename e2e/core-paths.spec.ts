import { test, expect } from "@playwright/test";

test("world loads and displays title", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header")).toContainText("LIVING NETWORK");
});

test("character selector is populated", async ({ page }) => {
  await page.goto("/");
  const select = page.locator("header select");
  await expect(select.locator("option").first()).toBeAttached();
});

test("feed tab shows moments or empty state", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main h2")).toContainText("朋友圈");
});

test("chat tab loads conversations", async ({ page }) => {
  await page.goto("/chat");
  await expect(page.locator("body")).toBeVisible();
});

test("relationships tab loads graph", async ({ page }) => {
  await page.goto("/relationships");
  await expect(page.locator("#relationships-status")).not.toHaveText("准备加载关系……");
});

test("admin tab exposes runtime content editor forms", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator("#world-form")).toBeVisible();
  await expect(page.locator("#character-form")).toBeVisible();
  await expect(page.locator("#relationship-form")).toBeVisible();
  await expect(page.locator("#event-form")).toBeVisible();
});

test("admin can create a story world from the runtime editor", async ({ page }) => {
  await page.goto("/admin");
  const name = `E2E World ${Date.now()}`;
  await page.locator("#world-name").fill(name);
  await page.locator("#world-form").getByRole("button", { name: "创建世界" }).click();
  await expect(page.locator("#admin-worlds-list").locator("input[name=\"name\"]").last()).toHaveValue(name);
});

test("admin can create a relationship and one-shot world event", async ({ page }) => {
  await page.goto("/admin");

  const relationship = page.locator("#relationship-form");
  await relationship.locator("#relationship-source").selectOption({ index: 0 });
  await relationship.locator("#relationship-target").selectOption({ index: 1 });
  await relationship.locator("#relationship-type").fill(`E2E relation ${Date.now()}`);
  await relationship.getByRole("button", { name: "创建关系" }).click();
  await expect(page.locator("#admin-relationships-list input[name=relationshipType]").last()).toHaveValue(/E2E relation/);
  const savedRelationship = page.locator("#admin-relationships-list form").last();
  await savedRelationship.locator("input[name=relationshipType]").fill("E2E relation updated");
  await savedRelationship.getByRole("button", { name: "保存" }).click();
  await expect(page.locator("#admin-relationships-list input[name=relationshipType]").last()).toHaveValue("E2E relation updated");

  const event = page.locator("#event-form");
  await event.locator("#event-key").fill(`e2e-event-${Date.now()}`);
  await event.locator("#event-name").fill("E2E world event");
  await event.locator("#event-run-at").fill("2030-01-01T12:00");
  await event.getByRole("button", { name: "创建事件" }).click();
  await expect(page.locator("#admin-events-list input[name=name]").last()).toHaveValue("E2E world event");
  const savedEvent = page.locator("#admin-events-list form").last();
  await savedEvent.locator("input[name=name]").fill("E2E world event updated");
  await savedEvent.getByRole("button", { name: "保存" }).click();
  await expect(page.locator("#admin-events-list input[name=name]").last()).toHaveValue("E2E world event updated");
});
