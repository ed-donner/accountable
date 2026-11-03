// The reviewer subagent's PreToolUse hook: lets its shell run only commands that read.
// See .claude/agents/reviewer.md.

import { readFileSync } from "node:fs";

import { readOnlyGuardReply } from "./agent-hooks.mjs";

const reply = readOnlyGuardReply(JSON.parse(readFileSync(0, "utf8")));
if (reply) console.log(JSON.stringify(reply));
