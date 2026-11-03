import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LOCKFILE_MARGIN_MS,
  SHARED_SETTINGS,
  afterFailedInstall,
  commandFor,
  isReady,
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

  it("leaves out the shared app's settings and their built-in forms, keeping everything else", () => {
    const env = localEnv({ ...shared, PATH: "/usr/bin", ACCOUNTABLE_DB: "/tmp/test.db" });
    expect(env).toEqual({ PATH: "/usr/bin", ACCOUNTABLE_DB: "/tmp/test.db" });
  });

  it("leaves them out when the shell has them", () => {
    for (const [name, value] of Object.entries(shared)) vi.stubEnv(name, value);
    const env = localEnv();
    for (const name of [...SHARED_SETTINGS, ...Object.keys(shared)]) expect(env).not.toHaveProperty(name);
    expect(env.PATH).toBe(process.env.PATH);
  });

  it("leaves them out in any case, as Windows reads them, and stops uv loading a settings file", () => {
    expect(localEnv({ database_url: "postgresql://x", Supabase_Url: "https://x", UV_ENV_FILE: "x" })).toEqual({});
  });

  it("doesn't change the environment it's given", () => {
    const given = { ...shared };
    localEnv(given);
    expect(given).toEqual(shared);
  });
});
