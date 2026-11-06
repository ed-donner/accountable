// The factory's steps, run by .github/workflows/factory.yml, merging-agent.yml and review.yml.
//
//   node .github/factory/factory.mjs start            names the branch and starts the checklist
//   node .github/factory/factory.mjs stage <name>     runs one stage with Claude Code and commits it
//   node .github/factory/factory.mjs pull-request     pushes the branch and opens a draft pull request
//   node .github/factory/factory.mjs merge            the merging agent: merges main into this branch
//   node .github/factory/factory.mjs failed           marks the checklist where the run stopped
//
// Claude Code signs in with CLAUDE_CODE_OAUTH_TOKEN, so the runs use the subscription of whoever
// made the token. GitHub calls use the workflow's own token (GH_TOKEN).

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import console from "node:console";
import process from "node:process";
import { join } from "node:path";

const env = process.env;
const repo = env.GITHUB_REPOSITORY;
const temp = env.RUNNER_TEMP ?? "/tmp";
const base = env.BASE || "main";
const statePath = join(temp, "factory-state.json");
const logs = join(temp, "factory-logs");
mkdirSync(logs, { recursive: true });

const CHECKLIST = ["Plan", "Design", "Build", "Test", "Pull request", "Review", "Review fixes"];

// The steps in order, and where each starts on the checklist, so a run can start again partway
// (the workflow's "from" input). Steps before FROM are skipped.
const ORDER = ["plan", "design", "build-plan", "build", "test", "pull-request", "review", "review-fix", "finish"];
const AT = {
  plan: 0,
  design: 1,
  "build-plan": 2,
  build: 2,
  test: 3,
  "pull-request": 4,
  review: 5,
  "review-fix": 6,
  finish: 7,
};
const from = env.FROM || "plan";
if (!ORDER.includes(from)) throw new Error(`No stage called ${from}`);
function skipped(step) {
  if (ORDER.indexOf(step) >= ORDER.indexOf(from)) return false;
  console.log(`Skipped: this run starts at ${from}.`);
  return true;
}

// Each stage: its prompt, the session it runs in, the commit it ends with, and the checklist
// item it completes. A new session starts fresh; the others carry on from an earlier stage.
const STAGES = {
  plan: {
    prompt: "1-plan.md",
    session: "plan",
    fresh: true,
    commit: "Plan: intent.md agreed",
    done: 1,
  },
  design: {
    prompt: "2-design.md",
    session: "plan",
    commit: "Design: the spec",
    done: 2,
  },
  "build-plan": {
    prompt: "3-build-plan.md",
    session: "plan",
    commit: "Build: plan.md",
  },
  build: {
    prompt: "4-build.md",
    session: "build",
    fresh: true,
    commit: () => `Build: ${title()}`,
    done: 3,
  },
  test: {
    prompt: "5-test.md",
    session: "build",
    commit: "Test: checks and ui-check",
    done: 4,
  },
  review: {
    prompt: "6-review.md",
    session: "review",
    fresh: true,
    commit: "Deploy: review",
    done: 6,
  },
  "review-fix": {
    prompt: "7-review-fix.md",
    session: "build",
    commit: "Deploy: review fixes",
    done: 7,
  },
  "review-pr": { prompt: "review-pr.md", session: "review-pr", fresh: true },
  merge: {
    prompt: "merge.md",
    session: "merge",
    fresh: true,
    commit: "Fix: after merging main",
  },
};

function loadState() {
  return existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
}
function saveState(state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}
function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
    ...options,
  }).trim();
}
function git(...args) {
  return run("git", args);
}
function gh(args, input) {
  return run("gh", args, { input });
}
function title() {
  return (env.ISSUE_TITLE ?? "").replace(/^intent:\s*/i, "");
}
function branch() {
  return env.BRANCH;
}

function checklist(done, failed = false) {
  const state = loadState();
  const lines = CHECKLIST.map((name, i) => {
    if (i < done) return `- [x] ${name}`;
    if (i === done) return `- [ ] **${name}**${failed ? " (stopped: see the run)" : " (working)"}`;
    return `- [ ] ${name}`;
  });
  const finished = done >= CHECKLIST.length;
  const head = finished
    ? `**Factory:** finished on branch \`${branch()}\`. The pull request is ready for a person to review and merge.`
    : `**Factory:** working on this issue on branch \`${branch()}\`.`;
  const body = [head, "", ...lines, "", `[Watch the run](${env.RUN_URL})`].join("\n");
  if (state.commentId) {
    gh(["api", "-X", "PATCH", `repos/${repo}/issues/comments/${state.commentId}`, "-F", "body=@-"], body);
  } else {
    state.commentId = gh(
      ["api", `repos/${repo}/issues/${env.ISSUE_NUMBER}/comments`, "-F", "body=@-", "--jq", ".id"],
      body,
    );
  }
  state.done = done;
  saveState(state);
}

function commitAll(message) {
  git("add", "-A");
  const staged = spawnSync("git", ["diff", "--cached", "--quiet"]).status !== 0;
  if (staged) git("commit", "-q", "-m", message);
  return staged;
}

// The books' checks may not change on any factory branch, once main has them.
// The change that adds them (the books) is the one branch allowed to write them.
function guardProtected() {
  if (!env.PROTECTED) return;
  const onMain = spawnSync("git", ["cat-file", "-e", `origin/${base}:${env.PROTECTED}`]).status === 0;
  if (!onMain) return;
  const changed = spawnSync("git", ["diff", "--quiet", `origin/${base}`, "--", env.PROTECTED]).status !== 0;
  if (changed) {
    console.error(`::error::The factory may not change ${env.PROTECTED}.`);
    process.exit(1);
  }
}

function push() {
  const url = `https://x-access-token:${env.GH_TOKEN}@github.com/${repo}.git`;
  run("git", ["push", "-q", url, `HEAD:refs/heads/${branch()}`]);
}

function claude(stageName) {
  const stage = STAGES[stageName];
  const state = loadState();
  state.sessions ??= {};
  const prompt = readFileSync(join(import.meta.dirname, stage.prompt), "utf8")
    .replaceAll("{{BRANCH}}", branch() ?? "")
    .replaceAll("{{INTENT}}", env.ISSUE_BODY ?? "")
    .replaceAll("{{BASE}}", base);
  let session;
  if (stage.fresh || !state.sessions[stage.session]) {
    state.sessions[stage.session] = randomUUID();
    session = ["--session-id", state.sessions[stage.session]];
  } else {
    session = ["--resume", state.sessions[stage.session]];
  }
  saveState(state);
  const args = [
    "-p",
    prompt,
    ...session,
    ...(env.CLAUDE_ARGS ?? "").split(" ").filter(Boolean),
    "--append-system-prompt",
    "Run any subagents in the foreground and wait for each to finish before you end your turn. " +
      "You are on one of GitHub's computers, which is much slower than a developer's. When your task asks you to run " +
      "the checks, run npm run check:quick, never npm run check, as the project's CI does (the lead runs the " +
      "end-to-end and speed tests on their own computer). Run no checks your task doesn't ask for.",
    "--output-format",
    "stream-json",
    "--verbose",
  ];
  const log = join(logs, `${stageName}.jsonl`);
  console.log(`Claude Code: ${stageName}, session ${state.sessions[stage.session]}`);
  const result = spawnSync("claude", args, {
    encoding: "utf8",
    maxBuffer: 1 << 30,
    stdio: ["ignore", "pipe", "inherit"],
  });
  writeFileSync(log, result.stdout ?? "");
  const last = (result.stdout ?? "").trim().split("\n").filter(Boolean).pop();
  try {
    const summary = JSON.parse(last);
    console.log(`Done in ${Math.round((summary.duration_ms ?? 0) / 60000)} min, ${summary.num_turns} turns.`);
    console.log(summary.result ?? "");
  } catch {
    console.log("No summary in the output.");
  }
  if (result.status !== 0) {
    console.error(`::error::Claude Code stopped with exit code ${result.status} in ${stageName}.`);
    process.exit(result.status ?? 1);
  }
}

const [command, arg] = process.argv.slice(2);

if (command === "start") {
  if (from !== "plan") {
    // Starting again partway: carry on with the issue's checklist, and push from the start if
    // the pull request already exists.
    const state = loadState();
    const mine = gh([
      "api",
      `repos/${repo}/issues/${env.ISSUE_NUMBER}/comments`,
      "--paginate",
      "--jq",
      '.[] | select(.user.login == "github-actions[bot]" and (.body | startswith("**Factory:**"))) | .id',
    ]);
    const ids = mine.split("\n").filter(Boolean);
    if (ids.length) state.commentId = ids[ids.length - 1];
    state.pushed = ORDER.indexOf(from) > ORDER.indexOf("pull-request");
    saveState(state);
  }
  checklist(AT[from]);
} else if (command === "stage") {
  const stage = STAGES[arg];
  if (!stage) throw new Error(`No stage called ${arg}`);
  if (ORDER.includes(arg) && skipped(arg)) process.exit(0);
  claude(arg);
  guardProtected();
  const message = typeof stage.commit === "function" ? stage.commit() : stage.commit;
  commitAll(message);
  if (loadState().pushed) push();
  if (stage.done !== undefined && env.ISSUE_NUMBER) checklist(stage.done);
} else if (command === "pull-request") {
  if (skipped("pull-request")) process.exit(0);
  push();
  const state = loadState();
  state.pushed = true;
  saveState(state);
  const intentPath = `docs/changes/${branch()}/intent.md`;
  const intent = existsSync(intentPath) ? readFileSync(intentPath, "utf8") : "";
  const body = `Built by the factory from #${env.ISSUE_NUMBER}. A review by a second agent and its fixes follow.\n\n${intent}`;
  gh(
    [
      "pr",
      "create",
      "--draft",
      "--base",
      base,
      "--head",
      branch(),
      "--title",
      title(),
      "--label",
      "factory",
      "--body-file",
      "-",
    ],
    body,
  );
  checklist(5);
} else if (command === "post-review") {
  if (skipped("review")) process.exit(0);
  const reviewPath = `docs/changes/${branch()}/review.md`;
  const review = existsSync(reviewPath) ? readFileSync(reviewPath, "utf8") : "The reviewer wrote no report.";
  gh(["pr", "comment", branch(), "--body-file", "-"], `**Review by a second agent, in a fresh session:**\n\n${review}`);
} else if (command === "finish") {
  gh(["pr", "ready", branch()]);
  const sha = git("rev-parse", "HEAD");
  gh([
    "api",
    `repos/${repo}/statuses/${sha}`,
    "-f",
    "state=success",
    "-f",
    "context=factory / npm run check:quick",
    "-f",
    "description=Passed in the factory's last stage",
  ]);
  checklist(CHECKLIST.length);
} else if (command === "merge") {
  claude("merge");
  if (existsSync(".git/MERGE_HEAD")) {
    git("add", "-A");
    git("commit", "-q", "--no-edit");
  }
  guardProtected();
  commitAll(STAGES.merge.commit);
  push();
  const sha = git("rev-parse", "HEAD");
  gh([
    "api",
    `repos/${repo}/statuses/${sha}`,
    "-f",
    "state=success",
    "-f",
    "context=factory / npm run check:quick",
    "-f",
    "description=Passed after merging main",
  ]);
  gh([
    "pr",
    "comment",
    branch(),
    "--body",
    `The merging agent merged ${base} into this branch, and npm run check:quick passes.`,
  ]);
} else if (command === "review-pr") {
  claude("review-pr");
  const report = existsSync("review-report.md")
    ? readFileSync("review-report.md", "utf8")
    : "The reviewer wrote no report.";
  gh(["pr", "comment", env.PR_NUMBER, "--body-file", "-"], `**Review agent:**\n\n${report}`);
} else if (command === "failed") {
  const state = loadState();
  if (env.ISSUE_NUMBER && state.commentId) checklist(state.done ?? 0, true);
} else if (command === "output-branch") {
  appendFileSync(env.GITHUB_ENV, `BRANCH=${arg}\n`);
} else {
  console.error(
    "Usage: factory.mjs start | stage <name> | pull-request | post-review | finish | merge | review-pr | failed",
  );
  process.exit(1);
}
