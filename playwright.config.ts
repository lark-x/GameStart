import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "v2-*.spec.ts",
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
      command: "V2_API_PORT=4412 V2_SQLITE_PATH=:memory: V2_MEDIA_ROOT=/tmp/living-network-v2-e2e-media pnpm --filter @living-network/api dev",
      port: 4412,
      reuseExistingServer: false,
    },
    {
      command: "VITE_V2_ENABLE_MOCK=true V2_API_PROXY_TARGET=http://127.0.0.1:4412 pnpm --filter @living-network/web exec vite --host 127.0.0.1 --port 4473",
      port: 4473,
      reuseExistingServer: false,
    },
  ],
});
