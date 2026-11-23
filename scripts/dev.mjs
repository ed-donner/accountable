// Starts Accountable: the backend on port 8000 and the frontend on port 5173,
// then opens the browser. Accountable runs on a Mac. Set ACCOUNTABLE_NO_BROWSER=1
// to skip opening the browser.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import concurrently from "concurrently";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = 8000;
const WEB_PORT = 5173;
const APP_URL = `http://localhost:${WEB_PORT}`;

function stop(lines) {
  console.error("\n" + lines.join("\n") + "\n");
  process.exit(1);
}

// 1. Node.js 24 or later.
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 24) {
  stop([
    `Accountable needs Node.js 24 or later, and this computer has ${process.versions.node}.`,
    "Install the LTS version from https://nodejs.org, then run npm run dev again.",
  ]);
}

// 2. uv, which runs the Python backend.
const uv = spawnSync("uv", ["--version"], { stdio: "ignore" });
if (uv.error || uv.status !== 0) {
  stop([
    "Accountable needs a tool called uv to run its backend, and it isn't installed yet.",
    "Install it by following https://docs.astral.sh/uv/getting-started/installation/",
    "then close this window, open a new one and run npm run dev again.",
  ]);
}

// 3. The frontend's packages.
if (!existsSync(join(root, "node_modules"))) {
  stop(["Accountable's packages aren't installed yet. Run npm install first, then npm run dev."]);
}

console.log("\nStarting Accountable. The first start can take a minute while it gets ready.\n");

const { result } = concurrently(
  [
    {
      name: "backend",
      prefixColor: "cyan",
      command: `uv run uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT} --reload --reload-dir backend/app`,
    },
    { name: "frontend", prefixColor: "green", command: "npm run dev --workspace frontend" },
  ],
  { cwd: root, killOthersOn: ["failure", "success"], prefix: "name" },
);

// 4. Open the browser once both servers answer.
async function answers(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function openWhenReady() {
  for (let i = 0; i < 240; i++) {
    if ((await answers(`http://127.0.0.1:${API_PORT}/api/health`)) && (await answers(APP_URL))) {
      console.log(`\nAccountable is running at ${APP_URL}\nLeave this window open while you use it. Press Ctrl+C to stop.\n`);
      if (process.env.ACCOUNTABLE_NO_BROWSER !== "1") openBrowser(APP_URL);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error(`\nAccountable is taking a long time to start. Look above for a message, or open ${APP_URL} yourself.\n`);
}

function openBrowser(url) {
  const child = spawn("open", [url], { stdio: "ignore", detached: true });
  child.on("error", () => console.log(`Open ${url} in your browser.`));
  child.unref();
}

openWhenReady();

result.then(
  () => process.exit(0),
  () => {
    console.error(
      "\nAccountable stopped. If a message above says a port is already in use, Accountable may already be running in another window.\n",
    );
    process.exit(1);
  },
);
