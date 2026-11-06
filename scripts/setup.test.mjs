import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COPILOT_SETTINGS,
  LOCKFILE_MARGIN_MS,
  SHARED_SETTINGS,
  afterFailedInstall,
  commandFor,
  copilotSettings,
  devCopilotSettings,
  isReady,
  isTestRun,
  localEnv,
  needsInstall,
  nodeProblem,
  uvProblem,
} from "./setup.mjs";

describe("nodeProblem", () => {
  it("accepts Node 24 and later", () => {
    expect(nodeProblem("24.0.0")).toBeNull();
    expect(nodeProblem("26.13.0")).toBeNull();
    expect(nodeProblem("v26.13.0")).toBeNull();
  });

  it("explains an older Node and where to get a new one", () => {
    const message = nodeProblem("22.11.0");
    expect(message).toContain("Node 24 or later");
    expect(message).toContain("22.11.0");
    expect(message).toContain("https://nodejs.org");
  });
});

describe("uvProblem", () => {
  it("is happy when uv is there", () => {
    expect(uvProblem(true)).toBeNull();
  });

  it("says uv is missing and how to get it", () => {
    const message = uvProblem(false);
    expect(message).toContain("needs uv");
    expect(message).toContain("https://docs.astral.sh/uv");
  });
});

describe("needsInstall", () => {
  const base = { hasNodeModules: true, lockTime: 100_000, installedTime: 100_000 };

  it("installs when node_modules is missing", () => {
    expect(needsInstall({ ...base, hasNodeModules: false })).toBe(true);
  });

  it("installs when the hidden lockfile is missing", () => {
    expect(needsInstall({ ...base, installedTime: null })).toBe(true);
  });

  it("installs when the lockfile is more than the margin newer", () => {
    expect(needsInstall({ ...base, installedTime: base.lockTime - LOCKFILE_MARGIN_MS - 1 })).toBe(true);
  });

  it("skips on a tie", () => {
    expect(needsInstall(base)).toBe(false);
  });

  it("skips on a gap within the margin, as npm's own writes leave", () => {
    expect(needsInstall({ ...base, installedTime: base.lockTime - 0.5 })).toBe(false);
    expect(needsInstall({ ...base, installedTime: base.lockTime - LOCKFILE_MARGIN_MS })).toBe(false);
  });

  it("skips when the hidden lockfile is the newer one", () => {
    expect(needsInstall({ ...base, installedTime: base.lockTime + 5000 })).toBe(false);
  });
});

describe("afterFailedInstall", () => {
  it("warns and carries on with node_modules present", () => {
    const next = afterFailedInstall(true);
    expect(next.stop).toBe(false);
    expect(next.message).toContain("carrying on");
  });

  it("stops when there's nothing installed", () => {
    expect(afterFailedInstall(false).stop).toBe(true);
  });
});

describe("commandFor", () => {
  it("runs npm through cmd.exe on Windows", () => {
    expect(commandFor("npm", ["install"], "win32")).toEqual(["cmd.exe", ["/d", "/s", "/c", "npm", "install"]]);
  });

  it("runs commands directly elsewhere", () => {
    expect(commandFor("npm", ["install"], "darwin")).toEqual(["npm", ["install"]]);
    expect(commandFor("uv", ["sync"], "win32")).toEqual(["uv", ["sync"]]);
  });
});

describe("isReady", () => {
  const json = { "content-type": "application/json" };

  it("counts any successful reply as up", () => {
    expect(isReady(new Response("<!doctype html>", { status: 200 }))).toBe(true);
    expect(isReady(new Response("{}", { status: 200, headers: json }))).toBe(true);
  });

  it("counts the API's JSON refusal as up, since every route needs a token", () => {
    const refusal = new Response('{"detail": "Sign in to use Accountable."}', { status: 401, headers: json });
    expect(isReady(refusal)).toBe(true);
  });

  it("doesn't count a refusal that isn't the API's, or any other failure", () => {
    expect(isReady(new Response("Unauthorized", { status: 401, headers: { "content-type": "text/plain" } }))).toBe(
      false,
    );
    expect(isReady(new Response('{"detail": "Not Found"}', { status: 404, headers: json }))).toBe(false);
    expect(isReady(new Response("Bad Gateway", { status: 502 }))).toBe(false);
  });
});

describe("localEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  const shared = {
    DATABASE_URL: "postgresql://nobody@db.example/postgres",
    SUPABASE_URL: "https://project.supabase.example",
    SUPABASE_PUBLISHABLE_KEY: "publishable",
    VITE_SUPABASE_URL: "https://project.supabase.example",
    VITE_SUPABASE_PUBLISHABLE_KEY: "publishable",
  };
  const copilot = { OPENROUTER_API_KEY: "made-up-key", OPENROUTER_MODEL: "openai/gpt-4o-mini" };

  it("leaves out the shared app's settings and their built-in forms, keeping everything else", () => {
    const env = localEnv({ ...shared, PATH: "/usr/bin", ACCOUNTABLE_DB: "/tmp/test.db" });
    expect(env).toEqual({ PATH: "/usr/bin", ACCOUNTABLE_DB: "/tmp/test.db" });
  });

  it("leaves out the Copilot's two settings, so no test can reach OpenRouter, but keeps the stand-in's address", () => {
    const env = localEnv({ ...copilot, PATH: "/usr/bin", ACCOUNTABLE_MODEL_URL: "http://127.0.0.1:9" });
    expect(env).toEqual({ PATH: "/usr/bin", ACCOUNTABLE_MODEL_URL: "http://127.0.0.1:9" });
  });

  it("leaves them out when the shell has them", () => {
    for (const [name, value] of Object.entries({ ...shared, ...copilot })) vi.stubEnv(name, value);
    const env = localEnv();
    for (const name of [...SHARED_SETTINGS, ...COPILOT_SETTINGS, ...Object.keys(shared)]) {
      expect(env).not.toHaveProperty(name);
    }
    expect(env.PATH).toBe(process.env.PATH);
  });

  it("leaves them out in any case, as Windows reads them, and stops uv loading a settings file", () => {
    const env = {
      database_url: "postgresql://x",
      Supabase_Url: "https://x",
      openrouter_api_key: "x",
      UV_ENV_FILE: "x",
    };
    expect(localEnv(env)).toEqual({});
  });

  it("doesn't change the environment it's given", () => {
    const given = { ...shared };
    localEnv(given);
    expect(given).toEqual(shared);
  });
});

describe("copilotSettings", () => {
  const KEY = "made-up-key";
  const MODEL = "openai/gpt-4o-mini";

  it("reads both from the shell", () => {
    const shell = { OPENROUTER_API_KEY: KEY, OPENROUTER_MODEL: MODEL, PATH: "/usr/bin" };
    expect(copilotSettings(shell)).toEqual({ OPENROUTER_API_KEY: KEY, OPENROUTER_MODEL: MODEL });
  });

  it("reads both from .env's text, with its comments and quotes, and nothing else from it", () => {
    const text = `# OpenRouter\nOPENROUTER_API_KEY="${KEY}"\nOPENROUTER_MODEL='${MODEL}'\nDATABASE_URL=postgresql://x\n`;
    expect(copilotSettings({}, text)).toEqual({ OPENROUTER_API_KEY: KEY, OPENROUTER_MODEL: MODEL });
  });

  it("takes the shell's value over the file's, and the file's for the other", () => {
    const text = `OPENROUTER_API_KEY=file-key\nOPENROUTER_MODEL=${MODEL}\n`;
    expect(copilotSettings({ OPENROUTER_API_KEY: KEY }, text)).toEqual({
      OPENROUTER_API_KEY: KEY,
      OPENROUTER_MODEL: MODEL,
    });
  });

  it("counts a blank value as unset, in the shell or the file", () => {
    expect(copilotSettings({ OPENROUTER_API_KEY: "  " }, `OPENROUTER_API_KEY=${KEY}\n`)).toEqual({
      OPENROUTER_API_KEY: KEY,
    });
    expect(copilotSettings({ OPENROUTER_API_KEY: "", OPENROUTER_MODEL: " " }, "OPENROUTER_MODEL=\n")).toEqual({});
  });

  it("leaves out a setting found in neither, so the backend says there's no key and uses its own model", () => {
    // Not even as undefined, which a child's environment would get as the text "undefined".
    expect(Object.keys(copilotSettings({ PATH: "/usr/bin" }, ""))).toEqual([]);
  });
});

describe("isTestRun", () => {
  it("is true wherever a test run's slot is set, slot 0 included", () => {
    expect(isTestRun({ ACCOUNTABLE_TEST_SLOT: "3" })).toBe(true);
    expect(isTestRun({ ACCOUNTABLE_TEST_SLOT: "0" })).toBe(true);
  });

  it("is false for npm run dev and npm start", () => {
    expect(isTestRun({ PATH: "/usr/bin", ACCOUNTABLE_DB: "/tmp/test.db" })).toBe(false);
  });
});

describe("devCopilotSettings", () => {
  const envFile = () => "OPENROUTER_API_KEY=key-from-env-file\nOPENROUTER_MODEL=model-from-env-file\n";

  it("reads the two from .env for npm run dev", () => {
    expect(devCopilotSettings({ PATH: "/usr/bin" }, envFile)).toEqual({
      OPENROUTER_API_KEY: "key-from-env-file",
      OPENROUTER_MODEL: "model-from-env-file",
    });
  });

  it("takes the shell's over .env's", () => {
    expect(devCopilotSettings({ OPENROUTER_API_KEY: "made-up-key" }, envFile).OPENROUTER_API_KEY).toBe("made-up-key");
  });

  it("never reads .env in a test run, such as a copy an end-to-end test starts", () => {
    const read = vi.fn(envFile);
    expect(devCopilotSettings({ ACCOUNTABLE_TEST_SLOT: "0" }, read)).toEqual({});
    expect(read).not.toHaveBeenCalled();
  });

  it("still takes what a test run's shell gives, such as a made-up key for a stand-in", () => {
    const shell = { ACCOUNTABLE_TEST_SLOT: "2", OPENROUTER_API_KEY: "stand-in-key" };
    expect(devCopilotSettings(shell, envFile)).toEqual({ OPENROUTER_API_KEY: "stand-in-key" });
  });
});
