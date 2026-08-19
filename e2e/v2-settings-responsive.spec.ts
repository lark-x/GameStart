import { expect, test } from "@playwright/test";

const VIEWPORTS = {
  mobile_small: { width: 375, height: 812 },
  mobile_large: { width: 430, height: 932 },
  tablet: { width: 768, height: 1024 },
  laptop_small: { width: 1024, height: 768 },
  laptop: { width: 1280, height: 720 },
  desktop: { width: 1440, height: 900 },
  desktop_wide: { width: 1920, height: 1080 },
} as const;

const THEMES = [
  { id: "dawn", label: "暖阳" },
  { id: "dusk", label: "夜幕" },
  { id: "blossom", label: "樱语" },
  { id: "forest", label: "青野" },
  { id: "ocean", label: "海盐" },
  { id: "midnight", label: "星夜" },
] as const;

test.describe("Settings responsive layout", () => {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`settings layout renders at ${name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/v2/settings");

      if (viewport.width > 960) {
        const nav = page.getByRole("navigation", { name: "设置导航" });
        await expect(nav).toBeVisible();
      } else {
        const select = page.locator("#settings-nav-select");
        await expect(select).toBeVisible();
      }

      await expect(page.locator(".v2-settings-overview")).toBeVisible();
    });
  }

  test("model settings master/detail stacks on mobile", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile_small);
    await page.goto("/v2/settings/models");
    await expect(page.locator(".v2-profile-list")).toBeVisible();
    await expect(page.locator(".v2-model-editor")).toBeVisible();
  });

  test("logs list/detail stacks on mobile", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile_small);
    await page.goto("/v2/settings/logs");
    await expect(page.locator(".v2-log-layout")).toBeVisible();
  });
});

test.describe("Settings theme regression", () => {
  for (const theme of THEMES) {
    test(`settings pages render correctly with ${theme.id} theme`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop);

      // Go to Appearance and click the theme card to apply it
      await page.goto("/v2/settings/appearance");
      const themeCard = page.locator(".v2-theme-card").filter({ hasText: theme.label });
      await expect(themeCard).toBeVisible();
      await themeCard.click();

      // Verify data-theme attribute changes on the document
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);

      // Save the theme
      await page.getByRole("button", { name: "保存主题" }).click();

      // Verify settings nav renders with the new theme
      await page.goto("/v2/settings");
      await expect(page.getByRole("navigation", { name: "设置导航" })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);

      // Verify models page renders
      await page.goto("/v2/settings/models");
      await expect(page.locator(".v2-binding-summary")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);
    });
  }
});
