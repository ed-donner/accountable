// npm run check: formatting, linting, types, secrets and every test. It runs
// all of them even if one fails, then says which passed and which failed.
// npm run check:quick does the same without the end-to-end tests.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./lib/proc.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quick = process.argv.includes("--quick");
// The TypeScript and JavaScript: the frontend, the end-to-end tests and these scripts.
const jsPaths = "frontend e2e scripts eslint.config.js";

const tests = quick
  ? [
      ["Backend tests and coverage (pytest)", "npm run test:backend"],
      ["Frontend tests and coverage (Vitest)", "npm run test:frontend"],
    ]
  : [["All tests, with coverage (npm test)", "npm test"]];

const checks = [
  ["Frontend format (Prettier)", `npx prettier --check ${jsPaths}`],
  ["Frontend lint and complexity (ESLint)", `npx eslint --max-warnings 0 ${jsPaths}`],
  ["Frontend types (tsc)", "npm run typecheck -w frontend"],
  ["Backend format (ruff format)", "uv run ruff format --check backend"],
  ["Backend lint and complexity (ruff check)", "uv run ruff check backend"],
  ["Backend types (ty)", "uv run ty check"],
  [
    "Secrets in history and files (gitleaks)",
    "gitleaks git --no-banner --redact . && gitleaks dir --no-banner --redact .",
  ],
  ...tests,
];

function gitleaksInstalled() {
  return !spawnSync("gitleaks", ["version"], { stdio: "ignore" }).error;
}

const results = [];
for (const [name, command] of checks) {
  console.log(`\n=== ${name} ===\n`);
  if (command.startsWith("gitleaks") && !gitleaksInstalled()) {
    console.log("gitleaks isn't on this terminal's path. Install it (see One-time setup in docs/STATUS.md),");
    console.log("or if it's installed, open a new terminal so the path includes it.");
    results.push([name, false]);
    continue;
  }
  results.push([name, runCommand(command, { cwd: root }) === 0]);
}

console.log("\n=== Summary ===");
for (const [name, passed] of results) {
  console.log(`${passed ? "passed" : "FAILED"}  ${name}`);
}
const failed = results.filter(([, passed]) => !passed).length;
console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} of ${results.length} checks failed.`);
process.exit(failed === 0 ? 0 : 1);
