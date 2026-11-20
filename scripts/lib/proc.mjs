// Helpers for starting and stopping the app's servers. Built-in modules only,
// so they work before anything is installed.

import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import readline from "node:readline";

export const isWindows = process.platform === "win32";

/**
 * Start a child process with each line of its output prefixed, such as "[api]".
 * On Windows it runs through the shell, because Node won't start npm.cmd
 * without one. On Mac and Linux it gets its own process group, so the whole
 * group can be stopped at once.
 */
export function startProcess(label, command, { cwd, env } = {}) {
  const child = spawn(command, {
    cwd,
    env: { ...process.env, ...env },
    shell: true,
    detached: !isWindows,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = `[${label}] `;
  for (const stream of [child.stdout, child.stderr]) {
    const lines = readline.createInterface({ input: stream });
    lines.on("line", (line) => {
      process.stdout.write(prefix + line + "\n");
    });
  }
  return child;
}

/** Run a command to completion with its output shown as it is. Returns the exit code. */
export function runCommand(command, { cwd, env } = {}) {
  const result = spawnSync(command, {
    cwd,
    env: { ...process.env, ...env },
    shell: true,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/** Stop a child process and every process it started. */
export function stopProcess(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  try {
    if (isWindows) {
      // /T stops the whole tree, which includes Uvicorn's reload worker.
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    // Already gone.
  }
}

/** Ask a URL every 250ms until it answers, or fail after timeoutMs. */
export async function waitForUrl(url, { name, timeoutMs, child }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`The ${name} stopped before it started answering (exit code ${child.exitCode}).`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.status < 500) return;
    } catch {
      // Not answering yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The ${name} didn't start within ${Math.round(timeoutMs / 1000)} seconds (${url}).`);
}

/** Throw a plain message if something is already listening on the port. */
export function checkPortFree(port, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        reject(new Error(`Port ${port} is in use. Is Accountable already running?`));
      } else {
        reject(error);
      }
    });
    server.once("listening", () => server.close(() => resolve()));
    server.listen(port, host);
  });
}

/** Open a URL in the default browser. */
export function openBrowser(url) {
  try {
    if (isWindows) {
      // start's first quoted argument is a window title, hence the empty "".
      spawn("cmd", ["/c", "start", '""', url], {
        stdio: "ignore",
        detached: true,
        windowsHide: true,
        windowsVerbatimArguments: true,
      }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    }
  } catch {
    // Opening the browser is a convenience; the address is printed anyway.
  }
}
