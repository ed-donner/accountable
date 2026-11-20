// npm run dev: starts the backend and the frontend together (spec 2.8).
// Built-in modules only, so it works before anything is installed.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPortFree, openBrowser, runCommand, startProcess, stopProcess, waitForUrl } from "./lib/proc.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiPort = Number(process.env.ACCOUNTABLE_API_PORT ?? 8000);
const webPort = Number(process.env.ACCOUNTABLE_WEB_PORT ?? 5173);
const env = { ACCOUNTABLE_API_PORT: String(apiPort), ACCOUNTABLE_WEB_PORT: String(webPort) };

const children = [];
let stopping = false;

function stopAll(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children) stopProcess(child);
  process.exit(exitCode);
}

process.on("SIGINT", () => {
  console.log("\nStopping Accountable.");
  stopAll(0);
});
process.on("SIGTERM", () => stopAll(0));
process.on("uncaughtException", (error) => {
  console.error(error.message);
  stopAll(1);
});

async function main() {
  // npm writes node_modules/.package-lock.json only when an install finishes,
  // so an install that was cut short runs again. npm ci starts from an empty
  // node_modules, because npm install trusts half-unpacked packages.
  if (!existsSync(path.join(root, "node_modules", ".package-lock.json"))) {
    console.log("Installing packages. This happens once and needs the internet.");
    const install = existsSync(path.join(root, "package-lock.json")) ? "npm ci" : "npm install";
    if (runCommand(install, { cwd: root }) !== 0) {
      throw new Error("npm install failed. Check the messages above.");
    }
  }

  await checkPortFree(apiPort);
  await checkPortFree(webPort);

  console.log("Starting the backend. The first start downloads Python and its packages, which can take a few minutes.");
  // --reload-dir keeps the watcher on the Python code, away from node_modules.
  const api = startProcess(
    "api",
    `uv run uvicorn backend.app.main:app --reload --reload-dir backend --host 127.0.0.1 --port ${apiPort}`,
    { cwd: root, env },
  );
  children.push(api);

  const web = startProcess("web", "npm run dev -w frontend", { cwd: root, env });
  children.push(web);

  for (const [child, name] of [
    [api, "backend"],
    [web, "frontend"],
  ]) {
    child.on("exit", (code) => {
      if (stopping) return;
      console.error(`The ${name} stopped (exit code ${code}). Stopping Accountable.`);
      stopAll(code === 0 ? 0 : 1);
    });
  }

  await waitForUrl(`http://127.0.0.1:${apiPort}/api/meta`, { name: "backend", timeoutMs: 600_000, child: api });
  await waitForUrl(`http://127.0.0.1:${webPort}/`, { name: "frontend", timeoutMs: 120_000, child: web });

  const address = `http://localhost:${webPort}`;
  console.log(`\nAccountable is running at ${address}\nPress Ctrl+C to stop it.\n`);
  openBrowser(address);
}

main().catch((error) => {
  console.error(error.message);
  stopAll(1);
});
