// npm run check: formatting, linting, secrets, then everything npm test runs.
// npm run check:quick leaves out the end-to-end and speed tests.
// Add -- --failures-only to see only what failed, then the summary.

import { runChecks } from "./checks.mjs";

await runChecks({
  withCodeChecks: true,
  withBrowserTests: !process.argv.includes("--quick"),
  failuresOnly: process.argv.includes("--failures-only"),
});
