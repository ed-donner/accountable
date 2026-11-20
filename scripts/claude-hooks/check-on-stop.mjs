// Claude Code Stop hook: runs npm run check:quick when Claude finishes a turn.
// If a check fails, it stops Claude from finishing and sends back what failed,
// so Claude fixes it. It does that once a turn: the next time Claude stops
// (stop_hook_active), it lets it, so it can't loop forever.
//
// If no file has changed since the last time every check passed, it skips the
// run, since the result would be the same.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_LINES_PER_CHECK = 80;
const MAX_REASON_CHARS = 12000;

function git(args, env = {}) {
  const result = spawnSync("git", args, { cwd: root, env: { ...process.env, ...env }, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

// A hash of every file git can see, tracked or not (ignored files aside). It's
// made with a copy of the index, so the real index and staging are left alone.
function fileTreeHash() {
  const index = path.resolve(root, git(["rev-parse", "--git-path", "index"]));
  const copy = path.join(os.tmpdir(), `check-on-stop-${process.pid}.index`);
  try {
    if (fs.existsSync(index)) fs.copyFileSync(index, copy);
    git(["add", "--all"], { GIT_INDEX_FILE: copy });
    return git(["write-tree"], { GIT_INDEX_FILE: copy });
  } finally {
    fs.rmSync(copy, { force: true });
  }
}

// check.mjs prints "=== name ===" before each check and lists them under
// "=== Summary ===" as "passed  name" or "FAILED  name". This keeps the end of
// each failed check's output, where the errors and summaries are.
function describeFailures(output) {
  const text = stripVTControlCharacters(output).replace(/\r\n/g, "\n");
  const parts = text.split(/^=== (.+) ===$/m);
  const sections = new Map();
  for (let i = 1; i < parts.length; i += 2) sections.set(parts[i], parts[i + 1].trim());

  const failed = [...(sections.get("Summary") ?? "").matchAll(/^FAILED {2}(.+)$/gm)].map((m) => m[1].trim());
  if (failed.length === 0) return text.trim().split("\n").slice(-MAX_LINES_PER_CHECK).join("\n");

  return failed
    .map((name) => {
      const lines = (sections.get(name) ?? "").split("\n");
      const shown = lines.slice(-MAX_LINES_PER_CHECK).join("\n");
      const cut = lines.length > MAX_LINES_PER_CHECK ? "(earlier lines left out)\n" : "";
      return `=== ${name} ===\n${cut}${shown}`;
    })
    .join("\n\n");
}

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || "{}");

// Claude is already fixing what this hook sent back last time. Let it stop.
if (input.stop_hook_active) process.exit(0);

const passedFile = path.resolve(root, git(["rev-parse", "--git-path", "check-on-stop-passed"]));
const hash = fileTreeHash();
if (fs.existsSync(passedFile) && fs.readFileSync(passedFile, "utf8").trim() === hash) process.exit(0);

const run = spawnSync("npm run check:quick 2>&1", {
  cwd: root,
  shell: true,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  maxBuffer: 64 * 1024 * 1024,
  windowsHide: true,
});

if (run.status === 0) {
  fs.writeFileSync(passedFile, hash + "\n");
  process.exit(0);
}

const details = describeFailures(`${run.stdout ?? ""}${run.error ? `\n${run.error.message}` : ""}`);
const reason =
  "npm run check:quick failed. Fix what it found without loosening a rule, leaving a file out or " +
  "lowering a threshold (see Checks in AGENTS.md), then run npm run check:quick to confirm.\n\n" +
  (details.length > MAX_REASON_CHARS ? `(cut to the last part)\n${details.slice(-MAX_REASON_CHARS)}` : details);
process.stdout.write(JSON.stringify({ decision: "block", reason }));
