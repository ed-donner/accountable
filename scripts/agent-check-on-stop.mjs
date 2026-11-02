// The coding agent's Stop hook: runs npm run check:quick when the agent finishes a turn,
// and sends any failure back to it to fix, once. See .claude/settings.json.

import { readFileSync } from "node:fs";

import { stopHookReply } from "./agent-hooks.mjs";
import { runSync } from "./setup.mjs";

function runQuickCheck() {
  const check = runSync("npm", ["run", "--silent", "check:quick", "--", "--failures-only"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 2 ** 20,
  });
  const output = [check.stdout, check.stderr, check.error?.message].filter(Boolean).join("\n");
  return { passed: check.status === 0, output };
}

const reply = stopHookReply(JSON.parse(readFileSync(0, "utf8")), runQuickCheck);
if (reply) console.log(JSON.stringify(reply));
