import { defineConfig } from '@playwright/test'
import { E2E_ENV, ROOT } from './env'

/**
 * End-to-end tests (spec 2.10). They start their own backend and frontend on their own ports,
 * with their own database, so they never touch your data and never reuse a running app (R6).
 */
export default defineConfig({
  testDir: './tests',
  // One worker: the tests share one database, which each test reloads with the sample data.
  workers: 1,
  fullyParallel: false,
  // A stray test.only would skip every other test and still pass, so it always fails the run.
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://localhost:${E2E_ENV.ACCOUNTABLE_WEB_PORT}`,
    channel: 'chrome', // the installed Google Chrome
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `uv run uvicorn backend.app.main:app --port ${E2E_ENV.ACCOUNTABLE_API_PORT}`,
      cwd: ROOT,
      env: E2E_ENV,
      url: `http://127.0.0.1:${E2E_ENV.ACCOUNTABLE_API_PORT}/api/stages`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev --workspace frontend',
      cwd: ROOT,
      env: E2E_ENV,
      url: `http://localhost:${E2E_ENV.ACCOUNTABLE_WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
