import { expect, test } from "@playwright/test";

test("V2 mock creator flow covers review, assets, release, runtime, save and export", async ({ page }) => {
  await page.goto("/v2");
  await expect(page.getByRole("heading", { name: "Creator Game Platform" })).toBeVisible();

  await page.getByRole("tab", { name: "Review" }).click();
  await page.getByRole("button", { name: "Create Job" }).click();
  await expect(page.getByText(/Generation job .* is queued/)).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Candidate marked approved.")).toBeVisible();

  await page.getByRole("tab", { name: "Assets" }).click();
  await page.getByRole("button", { name: "Create Asset Job" }).click();
  await page.getByRole("button", { name: "Approve Asset" }).click();
  await expect(page.getByText("Asset candidate marked approved.")).toBeVisible();

  await page.getByRole("tab", { name: "Release" }).click();
  await page.getByRole("button", { name: "Create Release" }).click();
  await page.getByRole("button", { name: "Start Player Run" }).click();
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByText(/Prepared .*\.json/)).toBeVisible();

  await page.getByRole("tab", { name: "Player" }).click();
  await page.getByRole("button", { name: "Follow the stamped route to the Civic Archive" }).click();
  await page.getByRole("button", { name: "Save Run" }).click();
  await page.getByRole("button", { name: "Restore Save" }).click();
  await expect(page.getByText(/Restored Station checkpoint/)).toBeVisible();
});

test("V2 HTTP mode starts from empty SQLite and completes the offline release loop", async ({ page }) => {
  await page.goto("/v2");
  await page.getByRole("button", { name: "HTTP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create Starter World" })).toBeVisible();
  await page.getByRole("button", { name: "Create Starter World" }).click();
  await expect(page.getByText("My V2 Story World")).toBeVisible();

  await page.getByRole("tab", { name: "Release" }).click();
  await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create Release" }).click();
  await expect(page.getByText(/Release 0\.0\.2 is immutable/)).toBeVisible();
  await page.getByRole("button", { name: "Start Player Run" }).click();

  await page.getByRole("tab", { name: "Player" }).click();
  await expect(page.getByText("The first playable scene in this local story world.")).toBeVisible();
  await page.getByRole("button", { name: "Save Run" }).click();
  await page.getByRole("button", { name: "Restore Save" }).click();
  await expect(page.getByText(/Restored Station checkpoint|Restored Local checkpoint/)).toBeVisible();

  await page.getByRole("tab", { name: "Release" }).click();
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByText(/Prepared release:.*\.json/)).toBeVisible();

  await page.setViewportSize({ width: 360, height: 800 });
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});
