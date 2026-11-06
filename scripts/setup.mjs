// First-run setup and starting servers, shared by dev, start, test, seed and empty.
// Node built-ins only: on the first run, no npm package is installed yet.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MIN_NODE_MAJOR = 24;

// npm writes package-lock.json and the hidden lockfile within a millisecond of
// each other, so a straight "is it newer" check could reinstall for no reason,
// and a needless install is what would break an offline start.
export const LOCKFILE_MARGIN_MS = 2000;

/** The shared app's settings. With all three, the backend runs as the shared app, against Supabase. */
export const SHARED_SETTINGS = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];

/** The Copilot's settings (Z19). Only npm run dev and npm start pass them on, so no test can reach OpenRouter (C9). */
export const COPILOT_SETTINGS = ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"];

/** Where the backend asks for the model's replies in place of OpenRouter, which the tests point at a stand-in. */
export const MODEL_URL_SETTING = "ACCOUNTABLE_MODEL_URL";

/** Port 9 is the old discard service, where nothing listens. */
export const NO_MODEL = "http://127.0.0.1:9";

// The names the shared app's build reads, and uv's own way to load a settings file such as .env.
const LEFT_OUT_LOCALLY = new Set([
  ...SHARED_SETTINGS,
  ...COPILOT_SETTINGS,
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "UV_ENV_FILE",
]);

const UV_HELP = "Install uv from https://docs.astral.sh/uv/getting-started/installation/ and try again.";
const NODE_HELP = "Install the current LTS from https://nodejs.org and try again.";

export function nodeProblem(version) {
  const major = Number(String(version).replace(/^v/, "").split(".")[0]);
  if (Number.isInteger(major) && major >= MIN_NODE_MAJOR) return null;
  return `Accountable needs Node ${MIN_NODE_MAJOR} or later, and this computer has ${version}. ${NODE_HELP}`;
}

export function uvProblem(uvFound) {
  return uvFound ? null : `Accountable needs uv, which isn't installed. ${UV_HELP}`;
}

// Times are in milliseconds. installedTime is null when the hidden lockfile is missing.
export function needsInstall({ hasNodeModules, lockTime, installedTime }) {
  if (!hasNodeModules || installedTime === null) return true;
  return lockTime - installedTime > LOCKFILE_MARGIN_MS;
}

// What to do when npm install fails. With packages already there, the app can
// probably still run, so a dropped connection shouldn't stop it.
export function afterFailedInstall(hasNodeModules) {
  if (hasNodeModules) {
    return { stop: false, message: "Couldn't update the packages, so carrying on with the ones already installed." };
  }
  return { stop: true, message: "Couldn't install the packages. The first run needs an internet connection." };
}

/**
 * The environment for every command but npm start: the shell's, without the shared app's
 * settings or the Copilot's, so nothing the local commands start can reach Supabase or
 * OpenRouter, whatever the shell has. npm run dev adds the Copilot's back itself.
 */
export function localEnv(env = process.env) {
  // Windows ignores case in these names, so database_url there is the same setting.
  return Object.fromEntries(Object.entries(env).filter(([name]) => !LEFT_OUT_LOCALLY.has(name.toUpperCase())));
}

/** The text of .env at the project's root, or nothing when there's no .env. */
export function readEnvFile() {
  const file = path.join(ROOT, ".env");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

/**
 * The named settings, each from the shell where it's set there and from .env's text otherwise,
 * read as Node reads it. A blank one counts as unset, and one set in neither is left out.
 */
export function settingsFrom(names, shell, envFileText = "") {
  const fromFile = parseEnv(envFileText);
  const found = names.map((name) => [name, [shell[name], fromFile[name]].find((value) => value?.trim())]);
  return Object.fromEntries(found.filter(([, value]) => value));
}

/** The Copilot's two settings. One set nowhere is left out, so the backend uses its default or says there's no key. */
export function copilotSettings(shell, envFileText = "") {
  return settingsFrom(COPILOT_SETTINGS, shell, envFileText);
}

/** Whether this is npm test, npm run check or npm run e2e, or something one of them started, all of which hold a slot. */
export function isTestRun(env = process.env) {
  return env.ACCOUNTABLE_TEST_SLOT !== undefined;
}

/**
 * npm run dev's Copilot settings (C9). In a test run, such as a copy an end-to-end test starts,
 * .env isn't read at all, so no test can reach OpenRouter with the key kept there.
 */
export function devCopilotSettings(shell = process.env, envFile = readEnvFile) {
  return copilotSettings(shell, isTestRun(shell) ? "" : envFile());
}

/**
 * npm run dev's environment for both servers: without the Supabase settings, but with the Copilot's
 * two from the shell or .env (C9), and the shell's model address, if any, for trying the stand-in by hand.
 */
export function devEnv(shell = process.env, envFile = readEnvFile) {
  return { ...localEnv(shell), ...devCopilotSettings(shell, envFile) };
}

/**
 * The environment every layer of a test run starts from: without the shared app's settings or the
 * Copilot's, and with every backend asking nowhere for the model's replies unless it's given the
 * stand-in's address, so no check or test can reach Supabase or OpenRouter, whatever the shell has.
 */
export function testRunEnv(shell = process.env) {
  return { ...localEnv(shell), [MODEL_URL_SETTING]: NO_MODEL };
}

// The API refuses anyone not signed in, /api/meta included, and its JSON refusal
// shows it's up just as well as a page does.
export function isReady(reply) {
  if (reply.ok) return true;
  return reply.status === 401 && (reply.headers.get("content-type") ?? "").startsWith("application/json");
}

function portIsFreeOn(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(error.code !== "EADDRINUSE"));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

// "localhost" can reach either address, so another app on ::1 would take the
// browser's requests even though 127.0.0.1 looks free.
export async function portIsFree(port) {
  return (await portIsFreeOn(port, "127.0.0.1")) && (await portIsFreeOn(port, "::1"));
}

export async function stopIfTaken(port) {
  if (!(await portIsFree(port))) stop(`Port ${port} is in use. Is Accountable already running?`);
}

async function answers(url) {
  try {
    return isReady(await fetch(url, { signal: AbortSignal.timeout(1000) }));
  } catch {
    return false;
  }
}

/** Waits for every address to answer, for as long as isRunning says the servers are still going. */
export async function waitUntilReady(urls, isRunning, timeoutMs = Infinity) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && isRunning()) {
    if ((await Promise.all(urls.map(answers))).every(Boolean)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

// Windows can't run npm.cmd directly with spawn, so every process starts here.
export function commandFor(name, args, platform = process.platform) {
  if (platform === "win32" && name === "npm") return ["cmd.exe", ["/d", "/s", "/c", "npm", ...args]];
  return [name, args];
}

export function start(name, args, options = {}) {
  const [command, commandArgs] = commandFor(name, args);
  return spawn(command, commandArgs, { cwd: ROOT, stdio: "inherit", ...options });
}

export function runSync(name, args, options = {}) {
  const [command, commandArgs] = commandFor(name, args);
  return spawnSync(command, commandArgs, { cwd: ROOT, stdio: "inherit", ...options });
}

function timeOf(file) {
  return existsSync(file) ? statSync(file).mtimeMs : null;
}

export function stop(message) {
  console.error(message);
  process.exit(1);
}

export function setup() {
  const nodeIssue = nodeProblem(process.versions.node);
  if (nodeIssue) stop(nodeIssue);

  const uvFound = runSync("uv", ["--version"], { stdio: "ignore" }).status === 0;
  const uvIssue = uvProblem(uvFound);
  if (uvIssue) stop(uvIssue);

  const nodeModules = path.join(ROOT, "node_modules");
  const hasNodeModules = existsSync(nodeModules);
  const install = needsInstall({
    hasNodeModules,
    lockTime: timeOf(path.join(ROOT, "package-lock.json")),
    installedTime: timeOf(path.join(nodeModules, ".package-lock.json")),
  });
  if (install) {
    console.log("Installing what Accountable needs. This only takes a while the first time.");
    if (runSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"]).status !== 0) {
      const next = afterFailedInstall(hasNodeModules);
      if (next.stop) stop(next.message);
      console.warn(next.message);
    }
  }

  if (runSync("uv", ["sync", "--frozen", "--quiet"]).status !== 0) {
    stop("Couldn't set up the backend. The first run needs an internet connection.");
  }
}
