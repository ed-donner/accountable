// Stop hook: runs `npm run check:quick` when Claude finishes a turn. If it fails, the
// failure goes back to Claude to fix. It blocks only once: when Claude stops again after
// being sent back (stop_hook_active), the hook lets it stop and tells the user instead,
// so it can never loop.
import { spawnSync } from "node:child_process";

const input = JSON.parse(await new Response(process.stdin).text());

const run = spawnSync("npm", ["run", "check:quick"], {
  cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  encoding: "utf8",
  env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  maxBuffer: 64 * 1024 * 1024,
});
if (run.status === 0) process.exit(0);

// The step summary is at the end, and each failing step's output comes before it.
const tail = `${run.stdout}${run.stderr}`.trim().split("\n").slice(-200).join("\n");

if (input.stop_hook_active) {
  const message = "npm run check:quick still fails after one attempt to fix it. Run it to see why.";
  console.log(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}

console.error(`npm run check:quick failed. Fix the failures, then finish.\n\n${tail}`);
process.exit(2); // exit code 2 stops Claude from finishing and shows this message to it
