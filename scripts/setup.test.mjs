import { describe, expect, it } from "vitest";

import { LOCKFILE_MARGIN_MS, afterFailedInstall, commandFor, needsInstall, nodeProblem, uvProblem } from "./setup.mjs";

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
