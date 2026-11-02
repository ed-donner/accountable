// The coding agent's PreToolUse hook: stops any edit to .env. See .claude/settings.json.

import { readFileSync } from "node:fs";

import { envGuardReply } from "./agent-hooks.mjs";

const reply = envGuardReply(JSON.parse(readFileSync(0, "utf8")));
if (reply) console.log(JSON.stringify(reply));
