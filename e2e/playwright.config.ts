import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const API_PORT = 8100;
export const WEB_PORT = 5273;

export default defineConfig({
  testDir: "./tests",
  outputDir: "../test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A test left as .only would quietly skip the rest, so npm test refuses it.
  forbidOnly: true,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    channel: "chrome",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  },
  webServer: [
    {
      command: "node scripts/e2e-backend.mjs",
      cwd: root,
      url: `http://127.0.0.1:${API_PORT}/api/meta`,
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "npm run dev -w frontend",
      cwd: root,
      url: `http://127.0.0.1:${WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ACCOUNTABLE_WEB_PORT: String(WEB_PORT),
        ACCOUNTABLE_API_PORT: String(API_PORT),
        ACCOUNTABLE_VITE_CACHE: "node_modules/.vite-e2e",
      },
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
  projects: [
    { name: "app", testIgnore: /reset\.spec\.ts/ },
    { name: "reset", testMatch: /reset\.spec\.ts/, dependencies: ["app"] },
  ],
});
