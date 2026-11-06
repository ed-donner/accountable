// npm start: the shared app on this computer, built and run the way Render runs it, against Supabase.
// Its migrations change the team's real database, so no test runs this file: they test its parts.

import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ROOT,
  SHARED_SETTINGS,
  copilotSettings,
  localEnv,
  readEnvFile,
  runSync,
  settingsFrom,
  setup,
  start,
  stop,
  stopIfTaken,
  waitUntilReady,
} from "./setup.mjs";

export const PORT = 8000;

/**
 * The shared app's three settings, each from the shell where it's set there and from .env
 * otherwise, and the names of any found in neither. A blank one counts as missing.
 */
export function readSettings(shell, envFileText = "") {
  const settings = settingsFrom(SHARED_SETTINGS, shell, envFileText);
  return { settings, missing: SHARED_SETTINGS.filter((name) => !settings[name]) };
}

export function missingMessage(missing) {
  const names = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}`;
  return `npm start needs ${names}. Add ${missing.length === 1 ? "it" : "them"} to .env, as docs/STATUS.md explains, and try again.`;
}

/**
 * The frontend build's environment: the shell's, with no setting of the shared app's and no VITE_
 * setting but the two the page needs. Vite builds VITE_ settings into the page, where anyone can
 * read them, so DATABASE_URL and its password must never be one.
 */
export function buildEnv(settings, shell = process.env) {
  const withoutVite = Object.entries(localEnv(shell)).filter(([name]) => !name.toUpperCase().startsWith("VITE_"));
  return {
    ...Object.fromEntries(withoutVite),
    VITE_SUPABASE_URL: settings.SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: settings.SUPABASE_PUBLISHABLE_KEY,
  };
}

/**
 * The backend's environment: the shell's, with the shared app's three settings, and the Copilot's
 * two wherever they're set. Without the Copilot's, it starts all the same, and the panel says
 * there's no key (Z21).
 */
export function backendEnv(settings, shell = process.env, envFileText = "") {
  return { ...shell, ...settings, ...copilotSettings(shell, envFileText) };
}

/** The backend's command, which is render.yaml's startCommand apart from the address. */
export function backendCommand(host, port) {
  return [
    "run",
    "--no-sync",
    "uvicorn",
    "accountable.main:app",
    "--host",
    host,
    "--port",
    String(port),
    "--workers",
    "1",
  ];
}

function settingsOrStop(envFileText) {
  const { settings, missing } = readSettings(process.env, envFileText);
  if (missing.length > 0) stop(missingMessage(missing));
  return settings;
}

function build(settings) {
  console.log("Building the frontend.");
  const vite = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
  const built = runSync(process.execPath, [vite, "build", "frontend", "--logLevel", "warn"], {
    env: buildEnv(settings),
  });
  if (built.status !== 0) stop("Couldn't build the frontend.");
}

async function main() {
  const envFileText = readEnvFile();
  const settings = settingsOrStop(envFileText);
  setup();
  await stopIfTaken(PORT);
  build(settings);

  console.log("Starting the shared app. The first start against an empty database also adds the sample data.");
  const server = start("uv", backendCommand("127.0.0.1", PORT), {
    env: backendEnv(settings, process.env, envFileText),
  });
  let running = true;
  server.on("exit", (code) => {
    running = false;
    process.exit(code ?? 0);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.kill(signal));
  }

  // No time limit: a first start fills the database over the internet, and the backend stops by itself if that fails.
  if (await waitUntilReady([`http://127.0.0.1:${PORT}/`], () => running)) {
    console.log(`\nAccountable is running at http://localhost:${PORT}`);
    console.log("This is the team's shared app: anything you change here changes the team's data.");
    console.log("Keep this window open while you use it. Press Ctrl+C to stop.\n");
  }
}

// Runs as npm start, and not when the tests import this file for its parts.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
