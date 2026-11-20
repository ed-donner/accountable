// Claude Code PreToolUse hook: refuses any change to a .env file. The .env is
// git-ignored and holds the local secrets, so only a person edits it.
//
// It covers the file tools (Edit, Write, NotebookEdit) and shell commands. A
// shell command is refused if it names a .env file at all, since telling a read
// from a write in shell is guesswork. .env.example and other names are fine.

import path from "node:path";

const FILE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
// ".env" as a whole path part: after a start, space, quote, slash or shell
// symbol, and before an end, space, quote or shell symbol.
const ENV_IN_COMMAND = /(^|[\s"'`/\\=<>|;&(:])\.env(?=$|[\s"'`<>|;&):])/;

function isEnvFile(filePath) {
  return typeof filePath === "string" && path.basename(filePath.replace(/\\/g, "/")) === ".env";
}

function reasonToRefuse({ tool_name: tool, tool_input: input = {} }) {
  if (FILE_TOOLS.has(tool) && (isEnvFile(input.file_path) || isEnvFile(input.notebook_path))) {
    return "This project's hook blocks every change to .env, since it holds the local secrets. Ask the user to make the change themselves.";
  }
  if (SHELL_TOOLS.has(tool) && typeof input.command === "string" && ENV_IN_COMMAND.test(input.command)) {
    return "This project's hook blocks shell commands that name .env, since they could change it and it holds the local secrets. Leave .env out of the command, or ask the user to make the change themselves.";
  }
  return null;
}

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const reason = reasonToRefuse(JSON.parse(raw));
if (reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
}
