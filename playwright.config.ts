import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:4473",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "API_PORT=4411 pnpm --filter @living-network/api dev",
      port: 4411,
      reuseExistingServer: false,
    },
    {
      command: "V1_API_PROXY_TARGET=http://127.0.0.1:4411 V2_API_PROXY_TARGET=http://127.0.0.1:4412 pnpm --filter @living-network/web exec vite --host 127.0.0.1 --port 4473",
      port: 4473,
      reuseExistingServer: false,
    },
    {
      command: "V2_API_PORT=4412 V2_SQLITE_PATH=:memory: pnpm --filter @living-network/api dev:v2",
      port: 4412,
      reuseExistingServer: false,
    },
  ],
});
