// First-run setup and starting servers, shared by dev, start, test, seed and empty.
// Node built-ins only: on the first run, no npm package is installed yet.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MIN_NODE_MAJOR = 24;

// npm writes package-lock.json and the hidden lockfile within a millisecond of
// each other, so a straight "is it newer" check could reinstall for no reason,
// and a needless install is what would break an offline start.
export const LOCKFILE_MARGIN_MS = 2000;

/** The shared app's settings. With all three, the backend runs as the shared app, against Supabase. */
export const SHARED_SETTINGS = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];

// The names the shared app's build reads, and uv's own way to load a settings file such as .env.
const LEFT_OUT_LOCALLY = new Set([
  ...SHARED_SETTINGS,
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
 * settings, so nothing the local commands start can reach Supabase, whatever the shell has.
 */
export function localEnv(env = process.env) {
  // Windows ignores case in these names, so database_url there is the same setting.
  return Object.fromEntries(Object.entries(env).filter(([name]) => !LEFT_OUT_LOCALLY.has(name.toUpperCase())));
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
