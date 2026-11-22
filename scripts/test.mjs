// `npm test`: runs every suite (backend, frontend unit, end-to-end) even when one
// fails, prints a summary, and exits with 1 if any suite failed.
import { spawnSync } from "node:child_process";

const suites = [
  ["Backend (pytest)", "npm run test:backend"],
  ["Frontend unit (Vitest)", "npm run test:frontend"],
  ["End-to-end (Playwright)", "npm run test:e2e"],
];

const results = suites.map(([name, command]) => {
  console.log(`\n=== ${name} ===\n`);
  const started = Date.now();
  const { status } = spawnSync(command, { stdio: "inherit", shell: true });
  return { name, ok: status === 0, seconds: ((Date.now() - started) / 1000).toFixed(1) };
});

console.log("\n=== Summary ===");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name} (${r.seconds}s)`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} suites failed.` : "\nAll suites passed.");
process.exit(failed ? 1 : 0);
