import { defineConfig, devices } from "@playwright/test";

// The end-to-end tests run the app on their own ports with their own database,
// and fix today's date, so they never touch your data (R4, R13).
export const API_PORT = 8100;
export const WEB_PORT = 5273;
export const TODAY = "2026-11-16";
export const E2E_DB = "data/e2e.db";

const backendEnv = {
  ACCOUNTABLE_DB: E2E_DB,
  ACCOUNTABLE_TODAY: TODAY,
  ACCOUNTABLE_TESTING: "1",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1440, height: 900 },
        locale: "en-US",
      },
    },
  ],
  webServer: [
    {
      command: `uv run uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: backendEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev --workspace frontend",
      url: `http://localhost:${WEB_PORT}`,
      env: { ACCOUNTABLE_API_PORT: String(API_PORT), ACCOUNTABLE_WEB_PORT: String(WEB_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
