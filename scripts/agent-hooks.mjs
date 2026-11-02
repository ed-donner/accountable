// What the coding agent's hooks in .claude/settings.json decide, kept apart from
// reading the agent's message and answering it, so that it can be tested.

import { stripVTControlCharacters } from "node:util";

// Claude Code saves a hook message over 10,000 characters to a file and shows the
// agent only its start, so the check output sent back stays well under that.
const MOST_OUTPUT_SENT = 8000;
// The end of the output is the summary, which names everything that failed.
const KEPT_FROM_THE_END = 2000;

const FILE_REASON = ".env holds this computer's own keys, so only the user changes it. Ask them to make the change.";
const COMMAND_REASON =
  "This command names .env, which holds this computer's own keys, so only the user changes it. A command can " +
  "change a file in too many ways to tell a read from a write, so any command that names .env is stopped. " +
  "If you need something from it or in it, ask the user.";

// .env as a name of its own, not part of a longer one such as .env.example or .venv.
const NAMES_ENV = /(?<![\w.-])\.env(?![\w.-])/i;

/** True for a file called .env in any folder. macOS and Windows ignore case, so .ENV is the same file. */
export function isEnvFile(filePath) {
  return filePath.split(/[\\/]/).pop().toLowerCase() === ".env";
}

function envGuardReason(toolName, toolInput) {
  if (toolName === "Bash" || toolName === "PowerShell") {
    return NAMES_ENV.test(toolInput.command ?? "") ? COMMAND_REASON : null;
  }
  const filePath = toolInput.file_path ?? toolInput.notebook_path;
  return typeof filePath === "string" && isEnvFile(filePath) ? FILE_REASON : null;
}

/** The PreToolUse hook's answer to a tool call: null lets it go ahead. */
export function envGuardReply({ tool_name: toolName, tool_input: toolInput = {} }) {
  const reason = envGuardReason(toolName, toolInput);
  if (!reason) return null;
  return {
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  };
}

function lastLineBreak(text) {
  const at = text.lastIndexOf("\n");
  return at === -1 ? text.length : at;
}

/** Cuts whole lines from the middle of text longer than most, keeping its start and its end. */
export function shorten(text, most = MOST_OUTPUT_SENT) {
  if (text.length <= most) return text;
  const note = "\n[Some output was cut here. Run npm run check:quick to see all of it.]\n";
  const start = text.slice(0, most - KEPT_FROM_THE_END - note.length);
  const end = text.slice(-KEPT_FROM_THE_END);
  return start.slice(0, lastLineBreak(start)) + note + end.slice(end.indexOf("\n") + 1);
}

function checkFailedReason(output) {
  return [
    "npm run check:quick failed. Fix what it found, then run it again to confirm.",
    "Fix the code, not the rules. If a rule doesn't suit this project, ask the user.",
    "This hook won't stop you a second time, so if something can't be fixed now, say what and why.",
    "",
    shorten(stripVTControlCharacters(output).trim()),
  ].join("\n");
}

/**
 * The Stop hook's answer when the agent finishes a turn: null lets it stop. runCheck
 * returns { passed, output }. The hook blocks once at most, so it can't loop: when the
 * agent is already carrying on because of it, it lets the agent stop without checking.
 */
export function stopHookReply({ stop_hook_active: carryingOnBecauseOfThisHook }, runCheck) {
  if (carryingOnBecauseOfThisHook) return null;
  const { passed, output } = runCheck();
  return passed ? null : { decision: "block", reason: checkFailedReason(output) };
}
