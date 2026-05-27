import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3003",
    headless: true,
  },
  webServer: process.env.CI ? undefined : {
    command: "PORT=3003 BETTER_AUTH_SECRET=test-secret-at-least-32-chars-long BETTER_AUTH_URL=http://localhost:3003 node .next/standalone/apps/gateway/server.js",
    port: 3003,
    reuseExistingServer: true,
  },
})
