import { defineConfig, devices } from "@playwright/test";

// E2E tests run against a seeded database (`npm run db:seed`) and a running
// app. By default they start `next start` on port 3100 after `npm run build`.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next start -p 3100", url: "http://localhost:3100/login", reuseExistingServer: true },
});
