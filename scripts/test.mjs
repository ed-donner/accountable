// npm test: setup, one temporary database path, then every test layer.
// The path is chosen here, once, because Playwright reads its config again in
// every worker: a path made there would differ between the server and the reset.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { ROOT, runSync, setup } from "./setup.mjs";

setup();

const folder = mkdtempSync(path.join(tmpdir(), "accountable-test-"));
const env = {
  ...process.env,
  ACCOUNTABLE_DB: path.join(folder, "test.db"),
  ACCOUNTABLE_VITE_CACHE: path.join(folder, "vite"),
};

const bin = (...parts) => path.join(ROOT, "node_modules", ...parts);
const layers = [
  ["Type check", process.execPath, [bin("typescript", "bin", "tsc"), "--noEmit", "-p", "frontend"]],
  ["Backend unit tests", "uv", ["run", "--no-sync", "pytest", "-q"]],
  ["Frontend unit tests", process.execPath, [bin("vitest", "vitest.mjs"), "run", "--root", "frontend"]],
  ["End-to-end tests", process.execPath, [bin("@playwright", "test", "cli.js"), "test"]],
];

const failed = [];
for (const [name, command, args] of layers) {
  console.log(`\n${name}`);
  if (runSync(command, args, { env }).status !== 0) failed.push(name);
}

rmSync(folder, { recursive: true, force: true });

if (failed.length > 0) {
  console.error(`\nFailed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\nAll tests passed.");
