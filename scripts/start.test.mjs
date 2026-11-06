import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { COPILOT_SETTINGS, ROOT, SHARED_SETTINGS } from "./setup.mjs";
import { PORT, backendCommand, backendEnv, buildEnv, missingMessage, readSettings } from "./start.mjs";

const DATABASE_URL = "postgresql://postgres.project:database-password@pooler.supabase.example:5432/postgres";
const SUPABASE_URL = "https://project.supabase.example";
const SUPABASE_PUBLISHABLE_KEY = "publishable-key";
const ALL = { DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY };

const envFile = (values) =>
  Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");

describe("readSettings", () => {
  it("reads all three from .env", () => {
    expect(readSettings({}, envFile(ALL))).toEqual({ settings: ALL, missing: [] });
  });

  it("reads all three from the shell, with no .env", () => {
    expect(readSettings({ ...ALL, PATH: "/usr/bin" })).toEqual({ settings: ALL, missing: [] });
  });

  it("takes the shell's value over the file's, and the file's for the rest", () => {
    const shell = { SUPABASE_URL: "https://other.supabase.example" };
    const { settings } = readSettings(shell, envFile(ALL));
    expect(settings).toEqual({ ...ALL, SUPABASE_URL: "https://other.supabase.example" });
  });

  it("names each missing setting, counting a blank one as missing", () => {
    expect(readSettings({}, "").missing).toEqual(SHARED_SETTINGS);
    expect(readSettings({ SUPABASE_URL: " " }, envFile({ DATABASE_URL })).missing).toEqual([
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
    ]);
    expect(readSettings({ ...ALL, SUPABASE_PUBLISHABLE_KEY: "" }).missing).toEqual(["SUPABASE_PUBLISHABLE_KEY"]);
  });

  it("reads .env's comments and quotes as Node does", () => {
    const text = `# Supabase\nDATABASE_URL="${DATABASE_URL}"\nSUPABASE_URL='${SUPABASE_URL}'\nSUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}\n`;
    expect(readSettings({}, text).settings).toEqual(ALL);
  });

  it("starts without the Copilot's two, which it never asks for", () => {
    expect(readSettings({}, envFile(ALL))).toEqual({ settings: ALL, missing: [] });
  });
});

describe("backendEnv", () => {
  const COPILOT = { OPENROUTER_API_KEY: "made-up-key", OPENROUTER_MODEL: "openai/gpt-4o-mini" };

  it("gives the backend the three settings and the shell, with the model's address blank", () => {
    const env = backendEnv(ALL, { PATH: "/usr/bin" }, envFile(ALL));
    expect(env).toEqual({ ...ALL, PATH: "/usr/bin", ACCOUNTABLE_MODEL_URL: "" });
  });

  it("blanks a model address the shell has, so the key only ever goes to OpenRouter", () => {
    const env = backendEnv(ALL, { ACCOUNTABLE_MODEL_URL: "http://127.0.0.1:4321" }, envFile({ ...ALL, ...COPILOT }));
    expect(env.ACCOUNTABLE_MODEL_URL).toBe("");
  });

  it("passes the Copilot's two from .env", () => {
    const env = backendEnv(ALL, { PATH: "/usr/bin" }, envFile({ ...ALL, ...COPILOT }));
    expect(env).toMatchObject(COPILOT);
  });

  it("passes them from the shell, over .env's", () => {
    const env = backendEnv(ALL, { OPENROUTER_API_KEY: "shell-key" }, envFile({ ...ALL, ...COPILOT }));
    expect(env).toMatchObject({ OPENROUTER_API_KEY: "shell-key", OPENROUTER_MODEL: COPILOT.OPENROUTER_MODEL });
  });

  it("starts without them, leaving the backend to say there's no key", () => {
    const env = backendEnv(ALL, { PATH: "/usr/bin" }, envFile(ALL));
    for (const name of COPILOT_SETTINGS) expect(env).not.toHaveProperty(name);
  });

  it("never gives the frontend's build the key", () => {
    const shell = { PATH: "/usr/bin", ...COPILOT };
    expect(Object.values(buildEnv(ALL, shell))).not.toContain(COPILOT.OPENROUTER_API_KEY);
  });
});

describe("missingMessage", () => {
  it("names each missing setting and where to put it", () => {
    expect(missingMessage(["DATABASE_URL"])).toBe(
      "npm start needs DATABASE_URL. Add it to .env, as docs/STATUS.md explains, and try again.",
    );
    expect(missingMessage(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"])).toContain(
      "needs SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. Add them",
    );
    expect(missingMessage(SHARED_SETTINGS)).toContain("needs DATABASE_URL, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
  });
});

describe("buildEnv", () => {
  const shell = { ...ALL, PATH: "/usr/bin", VITE_SOMETHING_ELSE: "x", vite_lower: "y" };
  const env = buildEnv(ALL, shell);

  it("gives the build the URL and the publishable key, as VITE_ settings", () => {
    expect(env.VITE_SUPABASE_URL).toBe(SUPABASE_URL);
    expect(env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe(SUPABASE_PUBLISHABLE_KEY);
  });

  it("gives it no other VITE_ setting, even when the shell has one", () => {
    const vite = Object.keys(env).filter((name) => name.toUpperCase().startsWith("VITE_"));
    expect(vite.sort()).toEqual(["VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_URL"]);
  });

  it("never gives it DATABASE_URL or its password, under any name", () => {
    for (const name of SHARED_SETTINGS) expect(env).not.toHaveProperty(name);
    const values = Object.values(env).join("\n");
    expect(values).not.toContain("database-password");
    expect(values).not.toContain("pooler.supabase.example");
  });

  it("keeps the rest of the shell, so the build can find its tools", () => {
    expect(env.PATH).toBe("/usr/bin");
  });
});

describe("render.yaml", () => {
  const blueprint = readFileSync(path.join(ROOT, "render.yaml"), "utf8");

  it("starts the backend with npm start's command, apart from the address", () => {
    const startCommand = blueprint.match(/^\s*startCommand:\s*(.+)$/m)?.[1];
    expect(startCommand).toBe(["uv", ...backendCommand("0.0.0.0", "$PORT")].join(" "));
    expect(backendCommand("127.0.0.1", PORT)).toContain("127.0.0.1");
  });

  it("names the three settings and the Copilot's two without their values", () => {
    for (const name of [...SHARED_SETTINGS, ...COPILOT_SETTINGS]) {
      expect(blueprint).toMatch(new RegExp(`- key: ${name}\\n\\s*sync: false\\n`));
    }
  });

  it("checks health at the page, since every /api address needs a token", () => {
    expect(blueprint).toMatch(/^\s*healthCheckPath: \/$/m);
  });
});
