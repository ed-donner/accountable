// npm run dev: setup, port check, both servers, then the address.

import net from "node:net";
import path from "node:path";

import { ROOT, setup, start } from "./setup.mjs";

const webPort = Number(process.env.ACCOUNTABLE_WEB_PORT ?? 5173);
const apiPort = Number(process.env.ACCOUNTABLE_API_PORT ?? 8765);
const READY_TIMEOUT_MS = 60_000;

// "localhost" can reach either address, so another app on ::1 would take the
// browser's requests even though 127.0.0.1 looks free.
function portIsFree(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(error.code !== "EADDRINUSE"));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

async function stopIfTaken(port) {
  const free = (await portIsFree(port, "127.0.0.1")) && (await portIsFree(port, "::1"));
  if (!free) {
    console.error(`Port ${port} is in use. Is Accountable already running?`);
    process.exit(1);
  }
}

async function answers(url) {
  try {
    const reply = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return reply.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(isRunning) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline && isRunning()) {
    const ready =
      (await answers(`http://127.0.0.1:${apiPort}/api/meta`)) && (await answers(`http://127.0.0.1:${webPort}/`));
    if (ready) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

setup();
await stopIfTaken(webPort);
await stopIfTaken(apiPort);

const node = JSON.stringify(process.execPath);
const concurrently = path.join(ROOT, "node_modules", "concurrently", "dist", "bin", "index.js");
const vite = JSON.stringify(path.join(ROOT, "node_modules", "vite", "bin", "vite.js"));
const frontend = JSON.stringify(path.join(ROOT, "frontend"));

const servers = start(
  process.execPath,
  [
    concurrently,
    "--raw",
    "--kill-others",
    `uv run --no-sync uvicorn accountable.main:app --host 127.0.0.1 --port ${apiPort} --log-level warning`,
    `${node} ${vite} ${frontend} --logLevel warn`,
  ],
  { env: { ...process.env, ACCOUNTABLE_WEB_PORT: String(webPort), ACCOUNTABLE_API_PORT: String(apiPort) } },
);

let running = true;
servers.on("exit", (code) => {
  running = false;
  process.exit(code ?? 0);
});

// Ctrl+C reaches every process in the window on Mac and Linux, but a signal sent
// to this process alone would not, so pass it on and wait for the servers to go.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => servers.kill(signal));
}

if (await waitUntilReady(() => running)) {
  console.log(`\nAccountable is running at http://localhost:${webPort}`);
  console.log("Keep this window open while you use it. Press Ctrl+C to stop.\n");
} else if (running) {
  console.error("Accountable didn't start in time.");
  servers.kill("SIGTERM");
}
