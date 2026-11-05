// What the coding agent's hooks decide, those in .claude/settings.json and in the subagents'
// files in .claude/agents/, kept apart from reading the agent's message and answering it,
// so that it can be tested.

import path from "node:path";
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

function deny(reason) {
  return {
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  };
}

/** The PreToolUse hook's answer to a tool call: null lets it go ahead. */
export function envGuardReply({ tool_name: toolName, tool_input: toolInput = {} }) {
  const reason = envGuardReason(toolName, toolInput);
  return reason ? deny(reason) : null;
}

const UV_REASON =
  "This project runs Python through uv, so the project's own Python and packages are used: uv run python, " +
  "uv run --no-sync python - <<'EOF' for a script, and uv add for a package. A bare python, python3 or pip " +
  "runs whichever one the computer finds first.";

// A heredoc's body is text, not commands, so a line in it may start with python.
const HEREDOC_BODY = /<<-?[ \t]*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g;
const QUOTED = /'[^']*'|"(?:\\.|[^"\\])*"/g;
// python, python3, python3.12, pip or pip3 where a command starts, after any NAME=value settings.
const BARE_PYTHON = /(?:^|[;&|(\n])[ \t]*(?:\w+=\S*[ \t]+)*(?:python(?:3(?:\.\d+)?)?|pip3?)(?=[ \t\n;&|)]|$)/;

/** True if a shell command line runs python or pip itself, rather than through uv run. */
export function runsBarePython(line) {
  const commands = line.replace(HEREDOC_BODY, "$3").replace(QUOTED, "''");
  return BARE_PYTHON.test(commands);
}

/** The coding agent's PreToolUse hook for the shell: null lets a command go ahead, unless it skips uv. */
export function uvGuardReply({ tool_name: toolName, tool_input: toolInput = {} }) {
  if (toolName !== "Bash" || !runsBarePython(toolInput.command ?? "")) return null;
  return deny(UV_REASON);
}

// Commands that only read, each with the flags that would let it write a file or run another program.
const READ_ONLY_COMMANDS = new Map([
  ["cat", null],
  ["cd", null],
  ["cut", null],
  ["diff", null],
  ["echo", null],
  ["grep", null],
  ["head", null],
  ["ls", null],
  ["pwd", null],
  ["tail", null],
  ["tr", null],
  ["wc", null],
  ["git", /^(--output|-O|--open-files-in-pager)/],
  ["rg", /^--pre/],
  ["sort", /^(-[a-zA-Z]*o|--output)/],
]);
const READ_ONLY_GIT = new Set([
  "blame",
  "cat-file",
  "describe",
  "diff",
  "grep",
  "log",
  "ls-files",
  "ls-tree",
  "merge-base",
  "rev-list",
  "rev-parse",
  "shortlog",
  "show",
  "status",
]);
// git branch with these alone lists branches. Anything else could create, rename or delete one.
const BRANCH_LISTING = new Set(["--show-current", "-a", "--all", "-r", "--remotes", "-v", "-vv", "--list"]);
// sed -n printing one range of lines, such as 40,100p. sed's other commands and flags can
// write a file (w, -i) or run a program (e), so sed is let through in this form alone.
const PRINTED_LINES = /^(\d+|\$)(,(\d+|\$))?p$/;

const READ_ONLY_REASON =
  "The reviewer only reads, so its shell runs only commands that read: " +
  `${[...READ_ONLY_COMMANDS.keys()].join(", ")}, with git limited to ${[...READ_ONLY_GIT].join(", ")} ` +
  "and branch to list branches, and sed only as sed -n 40,100p to print a range of lines. They can be " +
  "joined with |, && or ;, and send output to /dev/null. Redirects into a file, $( ) and backticks are " +
  "stopped, so run each command on its own and use what it printed in the next. The Read tool reads " +
  "any part of a file too, with its offset and limit.";

// The pieces of a shell command line, tried in this order at each point.
const SHELL_PIECES = new RegExp(
  [
    /(?<harmless>\d?>>?(?:&\d|[ \t]*\/dev\/null(?![^\s|&;])))/, // 2>&1, >/dev/null and the like
    /(?<space>[ \t]+)/,
    /(?<separator>[|&;\n])/,
    // Plain, quoted or escaped characters, with no $( or backticks inside double quotes.
    /(?<word>(?:'[^']*'|"(?:\\.|[^"\\`$]|\$(?!\())*"|\\.|[^\s'"\\|&;<>`()])+)/,
    // Anything else: a redirect into a file, $( ), backticks, a subshell, an unclosed quote.
    /(?<other>.)/,
  ]
    .map((piece) => piece.source)
    .join("|"),
  "gs",
);
const QUOTED_OR_ESCAPED = /'([^']*)'|"((?:\\.|[^"\\])*)"|\\(.)/gs;

function unquote(word) {
  return word.replace(QUOTED_OR_ESCAPED, (_, single, double, escaped) => single ?? double ?? escaped);
}

/** Each simple command in a command line as its words, or null if the line holds anything else. */
function simpleCommands(line) {
  const commands = [[]];
  for (const { groups } of line.matchAll(SHELL_PIECES)) {
    if (groups.other) return null;
    if (groups.separator) commands.push([]);
    if (groups.word) commands.at(-1).push(unquote(groups.word));
  }
  return commands.filter((words) => words.length > 0);
}

// Skips git's own options that come before the subcommand and change nothing.
function fromGitSubcommand(args) {
  if (args[0] === "--no-pager") return fromGitSubcommand(args.slice(1));
  if (args[0] === "-C") return fromGitSubcommand(args.slice(2));
  return args;
}

function gitReadsOnly(args) {
  const [subcommand, ...rest] = fromGitSubcommand(args);
  if (subcommand === "branch") return rest.every((arg) => BRANCH_LISTING.has(arg));
  return READ_ONLY_GIT.has(subcommand);
}

function sedReadsOnly([quiet, lines, ...files]) {
  return quiet === "-n" && PRINTED_LINES.test(lines ?? "") && files.every((file) => !file.startsWith("-"));
}

function commandReadsOnly([name, ...args]) {
  if (name === "sed") return sedReadsOnly(args);
  if (!READ_ONLY_COMMANDS.has(name)) return false;
  const writingFlags = READ_ONLY_COMMANDS.get(name);
  if (writingFlags && args.some((arg) => writingFlags.test(arg))) return false;
  return name !== "git" || gitReadsOnly(args);
}

/** True if every command in a shell command line only reads. */
export function readsOnly(line) {
  const commands = simpleCommands(line);
  return commands !== null && commands.every(commandReadsOnly);
}

/** The reviewer subagent's PreToolUse hook: null lets a shell command that only reads go ahead. */
export function readOnlyGuardReply({ tool_name: toolName, tool_input: toolInput = {} }) {
  if (toolName !== "Bash" || readsOnly(toolInput.command ?? "")) return null;
  return deny(READ_ONLY_REASON);
}

const PLAYWRIGHT_FOLDER = ".playwright-mcp/";
const PLAYWRIGHT_FOLDER_REASON =
  "Save files from the browser in .playwright-mcp/, which git ignores, with a path such as " +
  ".playwright-mcp/dashboard-light-1440.png. The Playwright tools save a bare name such as dashboard.png " +
  "in the project, where the next git add would pick it up.";

/** True for a relative path inside .playwright-mcp/. */
export function isInPlaywrightFolder(filename) {
  return path.posix.normalize(filename.replaceAll("\\", "/")).startsWith(PLAYWRIGHT_FOLDER);
}

/** ui-check's PreToolUse hook: null lets a Playwright tool go ahead, unless it would save a file elsewhere. */
export function playwrightFolderGuardReply({ tool_input: toolInput = {} }) {
  const { filename } = toolInput;
  if (typeof filename !== "string" || isInPlaywrightFolder(filename)) return null;
  return deny(PLAYWRIGHT_FOLDER_REASON);
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
