// PreToolUse hook: blocks any edit to .env, the git-ignored file that holds the secrets.
// File tools are checked by path. Bash commands are checked for any mention of the .env
// file itself (not .env.example), which is a best-effort guard against `echo > .env`.
import { basename } from "node:path";

const input = JSON.parse(await new Response(process.stdin).text());
const { tool_name: tool, tool_input: args = {} } = input;

const path = args.file_path ?? args.notebook_path;
const editsEnv = path !== undefined && basename(path) === ".env";
const bashTouchesEnv =
  tool === "Bash" && /(^|[\s'"=/<>:;|&(])\.env(?![\w.-])/.test(args.command ?? "");

if (editsEnv || bashTouchesEnv) {
  console.error(
    ".env is protected: it holds the secrets and only the user edits it. " +
      "Tell the user what change .env needs and let them make it.",
  );
  process.exit(2); // exit code 2 blocks the tool call and shows this message to Claude
}
