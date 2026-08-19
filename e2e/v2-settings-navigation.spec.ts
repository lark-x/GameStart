import { expect, test } from "@playwright/test";

test.describe("Settings navigation and routing", () => {
  test("settings layout has secondary navigation", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/v2/settings");

    // Settings navigation is visible on desktop
    const nav = page.getByRole("navigation", { name: "设置导航" });
    await expect(nav).toBeVisible();

    // All nav items are present
    for (const label of ["概览", "模型", "Memory", "Prompt", "ComfyUI", "Runtime", "调用日志", "触发器", "外观"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("canonical settings routes load correctly", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const routes = [
      { path: "/v2/settings", expected: "系统" },
      { path: "/v2/settings/models", expected: "模型" },
      { path: "/v2/settings/memory", expected: "记忆引擎" },
      { path: "/v2/settings/prompt", expected: "提示词任务" },
      { path: "/v2/settings/comfyui", expected: "ComfyUI" },
      { path: "/v2/settings/runtime", expected: "Runtime" },
      { path: "/v2/settings/logs", expected: "调用日志" },
      { path: "/v2/settings/automation", expected: "触发器" },
      { path: "/v2/settings/appearance", expected: "外观" },
    ];

    for (const { path, expected } of routes) {
      await page.goto(path);
      // The settings nav should always be visible
      await expect(page.getByRole("navigation", { name: "设置导航" })).toBeVisible();
      // The page should contain relevant content
      await expect(page.getByText(expected, { exact: false }).first()).toBeVisible();
    }
  });

  test("legacy routes redirect to canonical paths", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const redirects = [
      { from: "/v2/services/models", to: "/v2/settings/models" },
      { from: "/v2/services/comfyui", to: "/v2/settings/comfyui" },
      { from: "/v2/services/runtime", to: "/v2/settings/runtime" },
      { from: "/v2/services/logs", to: "/v2/settings/logs" },
      { from: "/v2/automation", to: "/v2/settings/automation" },
    ];

    for (const { from, to } of redirects) {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to}$`));
      await expect(page.getByRole("navigation", { name: "设置导航" })).toBeVisible();
    }
  });

  test("active nav item is highlighted", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/v2/settings/models");

    const nav = page.getByRole("navigation", { name: "设置导航" });
    const modelsLink = nav.getByRole("link", { name: "模型", exact: true });
    await expect(modelsLink).toHaveAttribute("aria-current", "page");
  });

  test("mobile settings uses dropdown selector", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/v2/settings/models");

    // Mobile dropdown should be visible
    const select = page.locator("#settings-nav-select");
    await expect(select).toBeVisible();

    // Desktop nav should be hidden
    const nav = page.getByRole("navigation", { name: "设置导航" });
    await expect(nav).not.toBeVisible();
  });

  test("settings overview shows system status", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/v2/settings");

    // Overview should show status sections
    await expect(page.getByText("系统", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("AI", { exact: false }).first()).toBeVisible();
  });
});
