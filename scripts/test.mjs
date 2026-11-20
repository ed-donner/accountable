// npm test: runs the backend, frontend and end-to-end tests in turn. It runs
// all three even if one fails, then says which passed and which failed.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./lib/proc.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suites = [
  ["Backend (pytest)", "npm run test:backend"],
  ["Frontend (Vitest)", "npm run test:frontend"],
  ["End to end (Playwright)", "npm run test:e2e"],
];

const results = [];
for (const [name, command] of suites) {
  console.log(`\n=== ${name} ===\n`);
  const code = runCommand(command, { cwd: root });
  results.push([name, code === 0]);
}

console.log("\n=== Summary ===");
for (const [name, passed] of results) {
  console.log(`${passed ? "passed" : "FAILED"}  ${name}`);
}
const failed = results.filter(([, passed]) => !passed).length;
console.log(failed === 0 ? "\nAll tests passed." : `\n${failed} of ${results.length} suites failed.`);
process.exit(failed === 0 ? 0 : 1);
