// The coding agent's PreToolUse hook: stops a shell command that runs python or pip
// without uv. See .claude/settings.json.

import { readFileSync } from "node:fs";

import { uvGuardReply } from "./agent-hooks.mjs";

const reply = uvGuardReply(JSON.parse(readFileSync(0, "utf8")));
if (reply) console.log(JSON.stringify(reply));
