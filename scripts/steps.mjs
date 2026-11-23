// Runs each step even when an earlier one fails, prints a pass or fail
// summary, and exits with 1 if any step failed.
import { spawnSync } from "node:child_process";

export function runSteps(steps) {
  const results = steps.map(([name, command]) => {
    console.log(`\n=== ${name} ===\n`);
    const started = Date.now();
    const { status } = spawnSync(command, { stdio: "inherit", shell: true });
    return { name, ok: status === 0, seconds: ((Date.now() - started) / 1000).toFixed(1) };
  });

  console.log("\n=== Summary ===");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name} (${r.seconds}s)`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} of ${results.length} failed.` : "\nAll passed.");
  process.exit(failed ? 1 : 0);
}
