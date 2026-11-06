// Starts one backend and one Vite server for each Playwright worker, all at once, and one
// stand-in model for the whole run, which every backend asks in place of OpenRouter.
// Playwright's own webServer list starts them one after another, at about 1.4s each.

import { mkdirSync } from "node:fs";
import path from "node:path";

import { ROOT, isReady, localEnv, runSync, start } from "./setup.mjs";
import { standInSettings, startStandIn } from "./stand-in-model.mjs";
import { READY, stackFor } from "./test-plan.mjs";

const WAIT_MS = 60_000;

const vite = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
const workers = Number(process.env.ACCOUNTABLE_TEST_WORKERS);
const slot = Number(process.env.ACCOUNTABLE_TEST_SLOT);
const servers = [];

function stopEverything(message) {
  console.error(message);
  for (const { child } of servers) child.kill();
  process.exit(1);
}

// Servers sharing an empty cache would all try to fill it, so it's filled first.
if (runSync(process.execPath, [vite, "optimize", "frontend", "--logLevel", "warn"]).status !== 0) {
  stopEverything("Couldn't prepare the frontend for the tests.");
}

// In this process, so it stops with the rest. Only the backends get its address and a made-up key.
const standIn = await startStandIn().catch((error) => stopEverything(`Couldn't start the stand-in model: ${error}`));
const model = standInSettings(standIn.url);

for (let index = 0; index < workers; index += 1) {
  const stack = stackFor({ slot, worker: index, database: process.env.ACCOUNTABLE_DB });
  mkdirSync(path.dirname(stack.database), { recursive: true });
  const env = {
    ...localEnv(),
    ACCOUNTABLE_DB: stack.database,
    ACCOUNTABLE_WEB_PORT: String(stack.webPort),
    ACCOUNTABLE_API_PORT: String(stack.apiPort),
  };
  const apiPort = String(stack.apiPort);
  const backend = [
    "run",
    "--no-sync",
    "uvicorn",
    "accountable.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    apiPort,
    "--log-level",
    "warning",
  ];
  servers.push(
    { url: `http://127.0.0.1:${apiPort}/api/meta`, child: start("uv", backend, { env: { ...env, ...model } }) },
    {
      url: `http://127.0.0.1:${stack.webPort}/`,
      child: start(process.execPath, [vite, "frontend", "--logLevel", "warn"], { env }),
    },
  );
}

for (const { child, url } of servers) {
  child.on("exit", () => stopEverything(`The test server for ${url} stopped. Is something else using that port?`));
}

async function isUp(url) {
  try {
    return isReady(await fetch(url));
  } catch {
    return false;
  }
}

async function waitFor(url) {
  const deadline = Date.now() + WAIT_MS;
  while (!(await isUp(url))) {
    if (Date.now() > deadline) stopEverything(`The test server for ${url} didn't start in time.`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

await Promise.all(servers.map(({ url }) => waitFor(url)));
console.log(READY);
