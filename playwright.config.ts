import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @living-network/api dev",
      port: 3001,
      reuseExistingServer: true,
    },
    {
      command: "pnpm --filter @living-network/web dev",
      port: 4173,
      reuseExistingServer: true,
    },
  ],
});
