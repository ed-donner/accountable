// The ui-check subagent's PreToolUse hook: keeps every file a Playwright tool saves in
// .playwright-mcp/, which git ignores. See .claude/agents/ui-check.md.

import { readFileSync } from "node:fs";

import { playwrightFolderGuardReply } from "./agent-hooks.mjs";

const reply = playwrightFolderGuardReply(JSON.parse(readFileSync(0, "utf8")));
if (reply) console.log(JSON.stringify(reply));
