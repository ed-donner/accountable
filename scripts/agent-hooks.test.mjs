import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { envGuardReply, isEnvFile, shorten, stopHookReply } from "./agent-hooks.mjs";

const HERE = import.meta.dirname;

function hook(script, input) {
  const run = spawnSync(process.execPath, [path.join(HERE, script)], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  return { code: run.status, reply: run.stdout.trim() ? JSON.parse(run.stdout) : null };
}

const denied = (reply) => reply?.hookSpecificOutput.permissionDecision === "deny";

describe("isEnvFile", () => {
  it.each([".env", "frontend/.env", "/Users/someone/projects/accountable/.env", "C:\\work\\accountable\\.env", ".ENV"])(
    "knows %s is a .env file",
    (file) => expect(isEnvFile(file)).toBe(true),
  );

  it.each([".env.example", ".envrc", "frontend/src/env.ts", ".venv/bin/python", "my.env"])("knows %s isn't", (file) =>
    expect(isEnvFile(file)).toBe(false),
  );
});

describe("envGuardReply", () => {
  it.each(["Edit", "MultiEdit", "Write"])("stops %s from changing .env", (tool) => {
    expect(denied(envGuardReply({ tool_name: tool, tool_input: { file_path: "/repo/.env" } }))).toBe(true);
  });

  it("lets other files be edited", () => {
    expect(envGuardReply({ tool_name: "Write", tool_input: { file_path: "/repo/.env.example" } })).toBeNull();
    expect(envGuardReply({ tool_name: "Edit", tool_input: { file_path: "/repo/frontend/src/App.tsx" } })).toBeNull();
  });

  it.each([
    "echo KEY=1 >> .env",
    "cp .env.example .env",
    `sed -i '' 's/a/b/' "$CLAUDE_PROJECT_DIR/.env"`,
    "rm -f backend/../.ENV",
  ])("stops the command %s", (command) => {
    expect(denied(envGuardReply({ tool_name: "Bash", tool_input: { command } }))).toBe(true);
  });

  it("stops a PowerShell command too", () => {
    expect(
      denied(envGuardReply({ tool_name: "PowerShell", tool_input: { command: "Set-Content .env 'KEY=1'" } })),
    ).toBe(true);
  });

  it.each(["cat .env.example", "ls .venv/bin", "npm run check:quick", "git status"])(
    "lets the command %s run",
    (command) => expect(envGuardReply({ tool_name: "Bash", tool_input: { command } })).toBeNull(),
  );

  it("answers Claude Code through the hook script", () => {
    const blocked = hook("agent-guard-env.mjs", { tool_name: "Write", tool_input: { file_path: "/repo/.env" } });
    expect(blocked.code).toBe(0);
    expect(blocked.reply.hookSpecificOutput).toMatchObject({ hookEventName: "PreToolUse", permissionDecision: "deny" });

    expect(hook("agent-guard-env.mjs", { tool_name: "Write", tool_input: { file_path: "/repo/notes.txt" } })).toEqual({
      code: 0,
      reply: null,
    });
  });
});

describe("stopHookReply", () => {
  it("lets the agent stop when the checks pass", () => {
    expect(stopHookReply({ stop_hook_active: false }, () => ({ passed: true, output: "All passed" }))).toBeNull();
  });

  it("sends a failure back to the agent, without the color codes", () => {
    const reply = stopHookReply({ stop_hook_active: false }, () => ({
      passed: false,
      output: "\u001b[31mESLint\u001b[39m\n  2:9  error  'unused' is assigned a value but never used\n",
    }));

    expect(reply.decision).toBe("block");
    expect(reply.reason).toContain("npm run check:quick failed");
    expect(reply.reason).toContain("ESLint\n  2:9  error  'unused' is assigned a value but never used");
  });

  it("blocks only once, so the agent can always stop in the end", () => {
    const runCheck = vi.fn(() => ({ passed: false, output: "Still failing" }));

    expect(stopHookReply({ stop_hook_active: true }, runCheck)).toBeNull();
    expect(runCheck).not.toHaveBeenCalled();
  });

  it("lets the agent stop straight away through the hook script, once it has been sent back", () => {
    expect(hook("agent-check-on-stop.mjs", { hook_event_name: "Stop", stop_hook_active: true })).toEqual({
      code: 0,
      reply: null,
    });
  });
});

describe("shorten", () => {
  it("leaves short output alone", () => {
    expect(shorten("Summary\n  ESLint  FAILED", 100)).toBe("Summary\n  ESLint  FAILED");
  });

  it("cuts whole lines from the middle, keeping the first problems and the summary", () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `line ${i}`);
    const output = ["first problem", ...lines, "Summary: ESLint FAILED"].join("\n");

    const short = shorten(output, 8000);

    expect(short.length).toBeLessThanOrEqual(8000);
    expect(short.startsWith("first problem\n")).toBe(true);
    expect(short.endsWith("\nSummary: ESLint FAILED")).toBe(true);
    expect(short).toContain("Run npm run check:quick to see all of it.");
    expect(short.split("\n").every((line) => /^(line \d+|first problem|Summary.*|\[Some output.*|)$/.test(line))).toBe(
      true,
    );
  });
});
