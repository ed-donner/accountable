// Used by Playwright. Deletes e2e/.data/, then starts the backend on port 8100
// with its own database, so each run starts from fresh sample data.

import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startProcess, stopProcess } from "./lib/proc.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.ACCOUNTABLE_E2E_API_PORT ?? 8100);

rmSync(path.join(root, "e2e", ".data"), { recursive: true, force: true });

const api = startProcess("e2e-api", `uv run uvicorn backend.app.main:app --host 127.0.0.1 --port ${port}`, {
  cwd: root,
  env: { ACCOUNTABLE_DB_PATH: "e2e/.data/test.db", ACCOUNTABLE_API_PORT: String(port) },
});

function stop() {
  stopProcess(api);
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", () => stopProcess(api));
api.on("exit", (code) => process.exit(code ?? 1));
