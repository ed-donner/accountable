import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const root = path.dirname(fileURLToPath(import.meta.url));
const database = process.env.ACCOUNTABLE_DB;

// scripts/test.mjs picks the path once and passes it down. A wrong one here
// would wipe real records when a test resets the database.
if (!database) {
  throw new Error("ACCOUNTABLE_DB isn't set. Run the tests with npm test.");
}
const fromData = path.relative(path.join(root, "data"), path.resolve(database));
if (!fromData.startsWith("..") && !path.isAbsolute(fromData)) {
  throw new Error(`Refusing to run against ${database}: that's where real data lives.`);
}

const WEB_PORT = 5199;
const API_PORT = 8799;
const env = {
  ...(process.env as Record<string, string>),
  ACCOUNTABLE_WEB_PORT: String(WEB_PORT),
  ACCOUNTABLE_API_PORT: String(API_PORT),
};

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  outputDir: path.join(path.dirname(database), "playwright-results"),
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `uv run --no-sync uvicorn accountable.main:app --host 127.0.0.1 --port ${API_PORT} --log-level warning`,
      url: `http://127.0.0.1:${API_PORT}/api/meta`,
      cwd: root,
      env,
      reuseExistingServer: false,
    },
    {
      command: `node node_modules/vite/bin/vite.js frontend --logLevel warn`,
      url: `http://127.0.0.1:${WEB_PORT}/`,
      cwd: root,
      env,
      reuseExistingServer: false,
    },
  ],
});
