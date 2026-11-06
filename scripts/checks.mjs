// Runs the layers behind npm test and npm run check, in three stages, then one summary.
// npm run e2e runs only stage 2, for the tests it's given.
//
// 1. The quick layers, side by side: the code checks (npm run check only), the type
//    checks and the unit tests with their coverage.
// 2. The end-to-end tests, on as many workers as this machine can run well, shared
//    with any other test runs on it, such as one in another worktree.
// 3. The speed tests, alone, because their timings need a quiet machine. They wait
//    until no other run on this computer is busy, and other runs wait for them.
//
// No more than two runs on this computer go at once, and the rest wait their turn before
// stage 1, because more overload it.
//
// The database path and the slot, which says which ports this run's servers use, are
// chosen here, once, because Playwright reads its config again in every worker: a path
// made there would differ between the servers and the resets.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir, totalmem } from "node:os";
import path from "node:path";

import { ROOT, localEnv, setup, start, stop } from "./setup.mjs";
import { TURNS, chooseWorkers, workerPorts } from "./test-plan.mjs";
import { duration, readPlaywright, readPytest, readVitest, summarize } from "./test-report.mjs";
import { joinTestRuns } from "./test-runs.mjs";

const node = process.execPath;
const bin = (...parts) => path.join(ROOT, "node_modules", ...parts);
const playwright = bin("@playwright", "test", "cli.js");

// The root holds TypeScript 6 for typescript-eslint, which can't read TypeScript 7 yet,
// so the type check asks for the frontend's own TypeScript.
const frontendRequire = createRequire(path.join(ROOT, "frontend", "package.json"));
const tsc = path.join(path.dirname(frontendRequire.resolve("typescript/package.json")), "bin", "tsc");

const GITLEAKS_HELP =
  "The secrets check needs gitleaks, which isn't installed. Install it from https://github.com/gitleaks/gitleaks#installing and try again.";

// Port 9 is the old discard service, where nothing listens. Every backend a test run starts asks
// here for the model's replies, unless it's given the stand-in's address, so none can reach
// OpenRouter, whatever key it's given.
const NO_MODEL = "http://127.0.0.1:9";

// Captured output loses its color unless the runner is told it's still wanted.
const color = process.stdout.isTTY && !process.env.NO_COLOR ? { FORCE_COLOR: "1" } : {};

const codeChecks = [
  { name: "Prettier", command: node, args: [bin("prettier", "bin", "prettier.cjs"), "--check", "."] },
  { name: "ESLint", command: node, args: [bin("eslint", "bin", "eslint.js"), "--max-warnings=0", "."] },
  { name: "Ruff format", command: "uv", args: ["run", "--no-sync", "ruff", "format", "--check"] },
  { name: "Ruff check", command: "uv", args: ["run", "--no-sync", "ruff", "check"] },
  {
    name: "Secrets in git history",
    command: "gitleaks",
    args: ["git", "--redact", "--no-banner", "--verbose"],
    missing: GITLEAKS_HELP,
  },
  {
    name: "Secrets in files",
    command: "gitleaks",
    args: ["dir", "--redact", "--no-banner", "--verbose"],
    missing: GITLEAKS_HELP,
  },
];

function unitLayers(report, text) {
  return [
    { name: "Frontend types", command: node, args: [tsc, "--noEmit", "-p", "frontend"] },
    { name: "Backend types", command: "uv", args: ["run", "--no-sync", "ty", "check"] },
    {
      name: "Backend",
      command: "uv",
      args: [
        "run",
        "--no-sync",
        "pytest",
        "-q",
        "--cov",
        "--cov-report=term:skip-covered",
        `--junit-xml=${report("backend.xml")}`,
      ],
      env: { COVERAGE_FILE: report(".coverage") },
      read: () => readPytest(text("backend.xml")),
    },
    {
      name: "Frontend",
      command: node,
      args: [
        bin("vitest", "vitest.mjs"),
        "run",
        "--root",
        "frontend",
        "--coverage.enabled",
        `--coverage.reportsDirectory=${report("frontend-coverage")}`,
        "--reporter=default",
        "--reporter=json",
        `--outputFile.json=${report("frontend.json")}`,
      ],
      read: () => readVitest(text("frontend.json"), ROOT),
    },
  ];
}

function browserLayer(name, project, count, report, text) {
  const file = `${project}.json`;
  return {
    name,
    command: node,
    args: [playwright, "test", `--project=${project}`],
    live: true,
    env: {
      ACCOUNTABLE_TEST_WORKERS: String(count),
      ACCOUNTABLE_E2E_REPORT: report(file),
      // Outside the temporary folder, which goes at the end, so it's still there to read.
      ACCOUNTABLE_E2E_HTML: path.join(ROOT, "playwright-report", project),
    },
    read: () => readPlaywright(text(file)),
  };
}

function run(layer, env, failuresOnly) {
  const began = performance.now();
  return new Promise((resolve) => {
    const child = start(layer.command, layer.args, {
      env: { ...env, ...(layer.live ? {} : color), ...layer.env },
      stdio: layer.live ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.stderr?.on("data", (chunk) => (output += chunk));
    child.once("error", (error) => {
      output += `${error.code === "ENOENT" && layer.missing ? layer.missing : error.message}\n`;
      resolve({ code: 1, output });
    });
    child.once("close", (code) => resolve({ code, output }));
  }).then(({ code, output }) => {
    if (!layer.live && !(failuresOnly && code === 0)) console.log(`\n${layer.name}\n${output.trimEnd()}`);

    let results = null;
    try {
      results = layer.read?.() ?? null;
    } catch {
      // Nothing written, or something unreadable. Summarize treats both as a failure.
    }
    return { name: layer.name, code, ms: performance.now() - began, runsTests: Boolean(layer.read), results };
  });
}

function chooseBrowserWorkers(otherRuns = 0) {
  try {
    return chooseWorkers({
      cores: availableParallelism(),
      memoryGb: totalmem() / 2 ** 30,
      requested: process.env.ACCOUNTABLE_TEST_WORKERS,
      otherRuns,
    });
  } catch (error) {
    stop(error.message);
  }
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The end-to-end tests, sharing the machine with any other busy runs. Playwright's own args, such as a file or -g, pick which. */
async function runEndToEnd(thisRun, env, report, text, args = []) {
  const otherRuns = await thisRun.otherBusyRuns();
  const workers = chooseBrowserWorkers(otherRuns);
  const sharing = otherRuns > 0 ? `, sharing this computer with ${plural(otherRuns, "other test run")}` : "";
  console.log(`\nEnd-to-end tests, on ${plural(workers, "worker")}${sharing}\n`);
  const layer = browserLayer("End-to-end", "main", workers, report, text);
  return run({ ...layer, args: [...layer.args, ...args] }, env);
}

/** The end-to-end tests, then the speed tests once the machine is quiet. */
async function runBrowserTests(thisRun, env, report, text) {
  const endToEnd = await runEndToEnd(thisRun, env, report, text);

  console.log("\nSpeed tests, on their own\n");
  const handBackTurn = await thisRun
    .takeSpeedTurn(() =>
      console.log("Waiting for the other test runs on this computer to finish their checks and end-to-end tests.\n"),
    )
    .catch((error) => stop(error.message));
  const speed = await run(browserLayer("Speed", "speed", 1, report, text), env);
  await handBackTurn();
  return [endToEnd, speed];
}

function whyWaiting({ waitingFor, ahead }) {
  if (waitingFor === "speed tests") return "Waiting for the speed tests of another test run on this computer.";
  const place =
    ahead === 0
      ? "this one is next"
      : `${plural(ahead, "other test run")} ${ahead === 1 ? "is" : "are"} ahead of this one`;
  return `Waiting for a turn. ${TURNS} test runs at a time can go on this computer, and ${place}.`;
}

/** Waits for this run's turn, saying why each time the reason changes, and how long it waited once it has the turn. */
async function waitForTurn(thisRun) {
  const began = performance.now();
  let waited = false;
  await thisRun
    .takeTurn((reason) => {
      waited = true;
      console.log(`\n${whyWaiting(reason)}`);
    })
    .catch((error) => stop(error.message));
  if (waited) console.log(`\nGot a turn after waiting ${duration(performance.now() - began)}.\n`);
}

/**
 * Takes a slot, makes the temporary folder and the environment every layer runs in, and
 * waits for a turn. mostWorkers is the most this run could have, and their ports
 * have to be free in the slot it takes.
 */
async function startRun(mostWorkers) {
  setup();
  const startedAt = performance.now();
  const thisRun = await joinTestRuns({ portsFor: (slot) => workerPorts(slot, mostWorkers) }).catch((error) =>
    stop(error.message),
  );

  const folder = mkdtempSync(path.join(tmpdir(), "accountable-test-"));
  const report = (name) => path.join(folder, name);
  const text = (file) => readFileSync(report(file), "utf8");

  // Without the shared app's settings or the Copilot's, so no check or test can reach Supabase or OpenRouter.
  const env = {
    ...localEnv(),
    ACCOUNTABLE_MODEL_URL: NO_MODEL,
    ACCOUNTABLE_DB: report("test.db"),
    ACCOUNTABLE_TEST_SLOT: String(thisRun.slot),
    // Kept between runs to save filling it each time, and apart from the cache npm run dev uses.
    ACCOUNTABLE_VITE_CACHE: path.join(ROOT, "node_modules", ".vite-test"),
    // A file saved mid-run, by the person, an agent or a teammate, would otherwise reload pages mid-test.
    ACCOUNTABLE_VITE_WATCH: "off",
  };

  await waitForTurn(thisRun);
  return { startedAt, thisRun, folder, report, text, env };
}

function finishRun({ startedAt, folder }, finished, { othersBusy = false } = {}) {
  rmSync(folder, { recursive: true, force: true });
  const summary = summarize(finished, performance.now() - startedAt, { othersBusy });
  console.log(summary.text);
  process.exit(summary.passed ? 0 : 1);
}

/** Looks every few seconds for another busy run. Resolves true, once stopped, if it ever saw one. */
function watchForOtherRuns(thisRun) {
  let seen = false;
  const look = async () => {
    if ((await thisRun.otherBusyRuns()) > 0) seen = true;
  };
  const looking = [look()];
  const timer = setInterval(() => looking.push(look()), 2000);
  return async () => {
    clearInterval(timer);
    await Promise.all([...looking, look()]);
    return seen;
  };
}

/**
 * Runs the type checks and unit tests, plus the code checks and the browser tests when asked.
 * With failuresOnly, a check that passes shows only its line in the summary.
 */
export async function runChecks({ withCodeChecks, withBrowserTests, failuresOnly = false }) {
  const started = await startRun(withBrowserTests ? chooseBrowserWorkers() : 0);
  const { thisRun, report, text, env } = started;

  // Another run's tests slow these down, and the summary says so beside the slow ones.
  const stopWatching = watchForOtherRuns(thisRun);
  const quickLayers = [...(withCodeChecks ? codeChecks : []), ...unitLayers(report, text)];
  const finished = await Promise.all(quickLayers.map((layer) => run(layer, env, failuresOnly)));
  const othersBusy = await stopWatching();
  if (withBrowserTests) finished.push(...(await runBrowserTests(thisRun, env, report, text)));

  finishRun(started, finished, { othersBusy });
}

/** npm run e2e: only the end-to-end tests that Playwright's args pick, such as a file or -g, on servers and a database of their own. */
export async function runChosenEndToEnd(args) {
  const started = await startRun(chooseBrowserWorkers());
  const { thisRun, report, text, env } = started;
  finishRun(started, [await runEndToEnd(thisRun, env, report, text, args)]);
}
