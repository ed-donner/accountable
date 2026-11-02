import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

import { READY } from "./scripts/test-plan.mjs";

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

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  workers: Number(process.env.ACCOUNTABLE_TEST_WORKERS ?? 1),
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.ACCOUNTABLE_E2E_REPORT }],
    // Kept after the run, with a screenshot of each failure. CI uploads it when a check fails.
    ["html", { outputFolder: process.env.ACCOUNTABLE_E2E_HTML, open: "never" }],
  ],
  outputDir: path.join(path.dirname(database), "playwright-results"),
  projects: [
    { name: "main", testIgnore: "stress.spec.ts" },
    // Timings only mean something on a quiet machine, so scripts/test.mjs runs these last and alone.
    { name: "speed", testMatch: "stress.spec.ts", fullyParallel: false },
  ],
  use: {
    // The installed Google Chrome. GitHub's Ubuntu runner has one too, so CI tests with it as well.
    channel: "chrome",
    // Each Chrome starts with no shader cache, and browsers compiling shaders side by
    // side can stall on macOS's shared Metal cache. A stalled GPU process stops the
    // page drawing, which hangs the test. Nothing here needs a real GPU.
    launchOptions: { args: ["--disable-gpu"] },
    viewport: { width: 1440, height: 900 },
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/test-servers.mjs",
    wait: { stdout: new RegExp(READY) },
    cwd: root,
    reuseExistingServer: false,
  },
});
