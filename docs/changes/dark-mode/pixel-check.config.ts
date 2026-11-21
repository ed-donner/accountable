// The one-off light-mode pixel check for the dark-mode change (plan, Phase 0
// and Phase 5; intent, success criterion 4). npm test doesn't run it.
//
// It reuses the end-to-end setup: its own backend on a freshly seeded database
// (port 8100) and Vite on port 5273. The shots are kept outside the repo, in
// PIXEL_SHOTS (default: the system's temp folder), so a run in a worktree of
// the base commit and a run on the branch compare the same files.
//
//   Before:  npx playwright test -c docs/changes/dark-mode/pixel-check.config.ts --update-snapshots
//   After:   npx playwright test -c docs/changes/dark-mode/pixel-check.config.ts
//   After, with the mode button shown:  set PIXEL_SHOW_BUTTON=1 as well

import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";
import e2e from "../../../e2e/playwright.config";

export const SHOTS = (process.env.PIXEL_SHOTS ?? path.join(os.tmpdir(), "accountable-pixel-check")).replaceAll(
  "\\",
  "/",
);

export default defineConfig({
  ...e2e,
  testDir: ".",
  testMatch: "pixel-check.spec.ts",
  outputDir: "../../../test-results/pixel-check",
  reporter: [["list"]],
  snapshotPathTemplate: `${SHOTS}/{arg}{ext}`,
  expect: {
    ...e2e.expect,
    // Exactly the same pixels: no tolerance at all.
    toHaveScreenshot: { maxDiffPixels: 0, threshold: 0, animations: "disabled", caret: "hide", scale: "css" },
  },
  use: { ...e2e.use, contextOptions: { reducedMotion: "reduce" } },
  projects: [{ name: "pixel-check" }],
});
