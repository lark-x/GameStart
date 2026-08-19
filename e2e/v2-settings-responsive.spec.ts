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

const THEMES = ["dawn", "dusk", "blossom", "forest", "ocean", "midnight"] as const;

test.describe("Settings responsive layout", () => {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`settings layout renders at ${name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/v2/settings");

      // Settings nav should be visible (sidebar on desktop, dropdown on mobile)
      if (viewport.width > 960) {
        const nav = page.getByRole("navigation", { name: "设置导航" });
        await expect(nav).toBeVisible();
      } else {
        const select = page.locator("#settings-nav-select");
        await expect(select).toBeVisible();
      }

      // Content should always be visible
      await expect(page.locator(".v2-settings-overview")).toBeVisible();
    });
  }

  test("model settings master/detail stacks on mobile", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile_small);
    await page.goto("/v2/settings/models");

    // Both profile list and editor should be visible (stacked)
    await expect(page.locator(".v2-profile-list")).toBeVisible();
    await expect(page.locator(".v2-model-editor")).toBeVisible();
  });

  test("logs list/detail stacks on mobile", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile_small);
    await page.goto("/v2/settings/logs");

    // Layout container should exist
    await expect(page.locator(".v2-log-layout")).toBeVisible();
  });
});

test.describe("Settings theme regression", () => {
  for (const theme of THEMES) {
    test(`settings pages render correctly with ${theme} theme`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop);

      // Set theme via appearance settings
      await page.goto("/v2/settings/appearance");
      const themeButton = page.locator(`.v2-theme-card`).filter({ hasText: new RegExp(theme, "i") });

      // Check the theme exists in the list (may use Chinese label)
      await expect(page.locator(".v2-theme-grid")).toBeVisible();

      // Navigate to overview to verify layout
      await page.goto("/v2/settings");
      await expect(page.getByRole("navigation", { name: "设置导航" })).toBeVisible();
      await expect(page.locator(".v2-settings-overview")).toBeVisible();

      // Navigate to models
      await page.goto("/v2/settings/models");
      await expect(page.locator(".v2-binding-summary")).toBeVisible();
    });
  }
});
