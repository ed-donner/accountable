// npm test: setup, one temporary folder, then every test layer, in three stages.
//
// 1. The quick checks, side by side.
// 2. The end-to-end tests, on as many workers as this machine can run well.
// 3. The speed tests, alone, because their timings need a quiet machine.
//
// The database path is chosen here, once, because Playwright reads its config again
// in every worker: a path made there would differ between the servers and the resets.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { availableParallelism, tmpdir, totalmem } from "node:os";
import path from "node:path";

import { ROOT, setup, start } from "./setup.mjs";
import { chooseWorkers } from "./test-plan.mjs";
import { readPlaywright, readPytest, readVitest, summarize } from "./test-report.mjs";

setup();

const startedAt = performance.now();

let workers;
try {
  workers = chooseWorkers({
    cores: availableParallelism(),
    memoryGb: totalmem() / 2 ** 30,
    requested: process.env.ACCOUNTABLE_TEST_WORKERS,
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const folder = mkdtempSync(path.join(tmpdir(), "accountable-test-"));
const report = (name) => path.join(folder, name);
const text = (file) => readFileSync(report(file), "utf8");

const env = {
  ...process.env,
  ACCOUNTABLE_DB: report("test.db"),
  // Kept between runs to save filling it each time, and apart from the cache npm run dev uses.
  ACCOUNTABLE_VITE_CACHE: path.join(ROOT, "node_modules", ".vite-test"),
};

const node = process.execPath;
const bin = (...parts) => path.join(ROOT, "node_modules", ...parts);
const playwright = bin("@playwright", "test", "cli.js");

// Captured output loses its color unless the runner is told it's still wanted.
const color = process.stdout.isTTY && !process.env.NO_COLOR ? { FORCE_COLOR: "1" } : {};

const quickChecks = [
  {
    name: "Type check",
    command: node,
    args: [bin("typescript", "bin", "tsc"), "--noEmit", "-p", "frontend"],
  },
  {
    name: "Backend",
    command: "uv",
    args: ["run", "--no-sync", "pytest", "-q", `--junit-xml=${report("backend.xml")}`],
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
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${report("frontend.json")}`,
    ],
    read: () => readVitest(text("frontend.json"), ROOT),
  },
];

function browserLayer(name, project, count) {
  const file = `${project}.json`;
  return {
    name,
    command: node,
    args: [playwright, "test", `--project=${project}`],
    live: true,
    env: { ACCOUNTABLE_TEST_WORKERS: String(count), ACCOUNTABLE_E2E_REPORT: report(file) },
    read: () => readPlaywright(text(file)),
  };
}

function run(layer) {
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
      output += `${error.message}\n`;
      resolve({ code: 1, output });
    });
    child.once("close", (code) => resolve({ code, output }));
  }).then(({ code, output }) => {
    if (!layer.live) console.log(`\n${layer.name}\n${output.trimEnd()}`);

    let results = null;
    try {
      results = layer.read?.() ?? null;
    } catch {
      // Nothing written, or something unreadable. Summarize treats both as a failure.
    }
    return { name: layer.name, code, ms: performance.now() - began, runsTests: Boolean(layer.read), results };
  });
}

const finished = await Promise.all(quickChecks.map(run));

console.log(`\nEnd-to-end tests, on ${workers} ${workers === 1 ? "worker" : "workers"}\n`);
finished.push(await run(browserLayer("End-to-end", "main", workers)));

console.log("\nSpeed tests, on their own\n");
finished.push(await run(browserLayer("Speed", "speed", 1)));

rmSync(folder, { recursive: true, force: true });

const summary = summarize(finished, performance.now() - startedAt);
console.log(summary.text);
process.exit(summary.passed ? 0 : 1);
