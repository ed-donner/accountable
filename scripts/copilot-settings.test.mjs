// What the backend reads of the Copilot's settings from the environment each way of running it
// gives it: npm run dev, npm start, a test run, and a test run's backends beside the stand-in.
// The backend's own model.settings() reads each, so a name that differs between a script and
// model.py, or a test run that could reach OpenRouter, fails here.

import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { NO_MODEL, ROOT, devEnv, testRunEnv } from "./setup.mjs";
import { STAND_IN_KEY, standInSettings } from "./stand-in-model.mjs";
import { backendEnv } from "./start.mjs";

const OPENROUTER = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openrouter/free";
const KEY = "made-up-key";
const MODEL = "openai/gpt-4o-mini";
const ENV_FILE = `OPENROUTER_API_KEY=${KEY}\nOPENROUTER_MODEL=${MODEL}\n`;
const SHELL = { PATH: "/usr/bin" };
const SHARED = {
  DATABASE_URL: "postgresql://nobody@db.example/postgres",
  SUPABASE_URL: "https://project.supabase.example",
  SUPABASE_PUBLISHABLE_KEY: "publishable",
};
const STAND_IN = "http://127.0.0.1:4321";

/** Python that prints what the backend's model.settings() reads from each environment it's given. */
const READ_EACH = `
import json, os, sys
from accountable.copilot import model
read = []
for env in json.load(sys.stdin):
    os.environ.clear()
    os.environ.update(env)
    chosen = model.settings()
    read.append({"key": chosen.key, "model": chosen.model, "url": chosen.url})
print(json.dumps(read))
`;

/** What the backend reads from each environment, all in one Python, since each start takes a moment. */
function backendReads(envs) {
  const ran = spawnSync("uv", ["run", "--no-sync", "python", "-c", READ_EACH], {
    cwd: ROOT,
    input: JSON.stringify(envs),
    encoding: "utf8",
  });
  if (ran.status !== 0) throw new Error(ran.stderr);
  return JSON.parse(ran.stdout);
}

const ENVIRONMENTS = {
  dev: devEnv(SHELL, () => ENV_FILE),
  devInATestRun: devEnv({ ...SHELL, ACCOUNTABLE_TEST_SLOT: "0" }, () => ENV_FILE),
  start: backendEnv(SHARED, { ...SHELL, ACCOUNTABLE_MODEL_URL: STAND_IN }, ENV_FILE),
  testRun: testRunEnv({ ...SHELL, OPENROUTER_API_KEY: KEY, OPENROUTER_MODEL: MODEL }),
  standIn: { ...testRunEnv({ ...SHELL, OPENROUTER_API_KEY: KEY }), ...standInSettings(STAND_IN) },
};

let read;

beforeAll(() => {
  const names = Object.keys(ENVIRONMENTS);
  const each = backendReads(Object.values(ENVIRONMENTS));
  read = Object.fromEntries(names.map((name, index) => [name, each[index]]));
}, 60_000);

describe("the Copilot's settings, as the backend reads them", () => {
  it("npm run dev gives the backend the key and the model from .env, and OpenRouter's address", () => {
    expect(read.dev).toEqual({ key: KEY, model: MODEL, url: OPENROUTER });
  });

  it("npm run dev in a test run gives no key, since it never reads .env there", () => {
    expect(read.devInATestRun).toEqual({ key: null, model: DEFAULT_MODEL, url: OPENROUTER });
  });

  it("npm start gives the key and the model, and OpenRouter's address even when the shell names another", () => {
    expect(read.start).toEqual({ key: KEY, model: MODEL, url: OPENROUTER });
  });

  it("a test run gives no key, and an address where nothing listens, whatever the shell has", () => {
    expect(read.testRun).toEqual({ key: null, model: DEFAULT_MODEL, url: NO_MODEL });
  });

  it("a test run's backends ask the stand-in, with its made-up key", () => {
    expect(read.standIn).toEqual({ key: STAND_IN_KEY, model: DEFAULT_MODEL, url: STAND_IN });
  });
});
