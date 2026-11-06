// npm run dev: setup, port check, both servers, then the address.

import path from "node:path";

import { ROOT, devCopilotSettings, localEnv, setup, start, stopIfTaken, waitUntilReady } from "./setup.mjs";

const webPort = Number(process.env.ACCOUNTABLE_WEB_PORT ?? 5173);
const apiPort = Number(process.env.ACCOUNTABLE_API_PORT ?? 8765);
const READY_TIMEOUT_MS = 60_000;

setup();
await stopIfTaken(webPort);
await stopIfTaken(apiPort);

const node = JSON.stringify(process.execPath);
const concurrently = path.join(ROOT, "node_modules", "concurrently", "dist", "bin", "index.js");
const vite = JSON.stringify(path.join(ROOT, "node_modules", "vite", "bin", "vite.js"));
const frontend = JSON.stringify(path.join(ROOT, "frontend"));

// concurrently runs each server through a shell. On Linux that shell stays in between,
// and a stop ends it at once, so this script would exit while a server still held its port.
// exec makes the shell become the server. Windows's cmd.exe has no exec.
const exec = process.platform === "win32" ? "" : "exec ";

const servers = start(
  process.execPath,
  [
    concurrently,
    "--raw",
    "--kill-others",
    `${exec}uv run --no-sync uvicorn accountable.main:app --host 127.0.0.1 --port ${apiPort} --log-level warning`,
    `${exec}${node} ${vite} ${frontend} --logLevel warn`,
  ],
  {
    env: {
      // Without the Supabase settings, but with the Copilot's two from the shell or .env (C9).
      ...localEnv(),
      ...devCopilotSettings(),
      ACCOUNTABLE_WEB_PORT: String(webPort),
      ACCOUNTABLE_API_PORT: String(apiPort),
    },
  },
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

const addresses = [`http://127.0.0.1:${apiPort}/api/meta`, `http://127.0.0.1:${webPort}/`];
if (await waitUntilReady(addresses, () => running, READY_TIMEOUT_MS)) {
  console.log(`\nAccountable is running at http://localhost:${webPort}`);
  console.log("Keep this window open while you use it. Press Ctrl+C to stop.\n");
} else if (running) {
  console.error("Accountable didn't start in time.");
  servers.kill("SIGTERM");
}
