import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
// Use a pre-installed Chromium when provided (CI images, sandboxes); otherwise Playwright's own.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export const E2E_ENV = {
  APP_ENV: "development",
  APP_URL: BASE,
  PGLITE_DIR: "./.data/e2e",
  PAYMENTS_TEST_GATEWAY: "enabled",
  SESSION_SECRET: "e2e-session-secret-0123456789-abcdefghijklmnop",
  ADMIN_PASSWORD: "e2e-admin-password-123",
  STORAGE_LOCAL_DIR: "./.data/e2e-storage",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1, // the embedded test database is single-process
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: BASE, trace: "retain-on-failure", screenshot: "only-on-failure", launchOptions: { executablePath } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 860 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    // Fresh database for every run, seeded, with a known admin — then the production server.
    command: `rm -rf .data/e2e .data/e2e-storage && npm run db:setup && npm run admin:create -- e2e@store76.test "E2E Owner" owner && npx next start -p ${PORT}`,
    url: `${BASE}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: E2E_ENV,
  },
});
