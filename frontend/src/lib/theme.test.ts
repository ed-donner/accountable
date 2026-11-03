import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { THEME_KEY, modeFor, savedTheme, setTheme, type Mode } from "./theme";

const root = document.documentElement;

function storageRefuses(method: "getItem" | "setItem") {
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new DOMException("The storage is off", "SecurityError");
  });
}

/** Stands in for the device's light or dark setting, which jsdom doesn't have. */
function standInDevice(dark: boolean) {
  const listeners = new Set<() => void>();
  const setting = {
    matches: dark,
    addEventListener: (_type: "change", listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: "change", listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", (query: string) => {
    expect(query).toBe("(prefers-color-scheme: dark)");
    return setting;
  });
  return {
    turn(darkNow: boolean) {
      setting.matches = darkNow;
      listeners.forEach((listener) => listener());
    },
  };
}

function shownMode() {
  return { mode: root.dataset.mode, colorScheme: root.style.colorScheme };
}

function showing(mode: Mode) {
  return { mode, colorScheme: mode };
}

describe("the saved theme", () => {
  it("is light when nothing has been saved", () => {
    expect(savedTheme()).toBe("light");
  });

  it.each(["light", "dark", "system"] as const)("reads back %s once chosen", (theme) => {
    standInDevice(false);
    setTheme(theme);
    expect(savedTheme()).toBe(theme);
  });

  it.each(["light", "dark"])("carries over %j, saved before System existed", (mode) => {
    localStorage.setItem("accountable-mode", mode);
    expect(savedTheme()).toBe(mode);
  });

  it.each(["Dark", "System", "", "blue"])("is light when %j was saved", (value) => {
    localStorage.setItem(THEME_KEY, value);
    expect(savedTheme()).toBe("light");
  });

  it("is light when storage can't be read", () => {
    localStorage.setItem(THEME_KEY, "dark");
    storageRefuses("getItem");
    expect(savedTheme()).toBe("light");
  });
});

describe("setting the theme", () => {
  it.each(["light", "dark"] as const)("shows %s mode and saves the choice", (theme) => {
    setTheme(theme);
    expect(shownMode()).toEqual(showing(theme));
    expect(localStorage.getItem(THEME_KEY)).toBe(theme);
  });

  it.each(["dark", "light"] as const)("shows a %s device's mode for System", (mode) => {
    standInDevice(mode === "dark");
    setTheme("system");
    expect(shownMode()).toEqual(showing(mode));
    expect(localStorage.getItem(THEME_KEY)).toBe("system");
    expect(modeFor("system")).toBe(mode);
  });

  it("follows the device as it changes while System is chosen", () => {
    const device = standInDevice(false);
    setTheme("system");

    device.turn(true);
    expect(shownMode()).toEqual(showing("dark"));

    device.turn(false);
    expect(shownMode()).toEqual(showing("light"));
  });

  it.each(["light", "dark"] as const)("stops following the device once %s is chosen", (theme) => {
    const device = standInDevice(false);
    setTheme("system");
    setTheme(theme);

    device.turn(theme === "light");
    expect(shownMode()).toEqual(showing(theme));
  });

  it("still switches when storage can't be written", () => {
    storageRefuses("setItem");
    expect(() => setTheme("dark")).not.toThrow();
    expect(shownMode()).toEqual(showing("dark"));
  });
});

describe("the script at the top of index.html", () => {
  const page = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../index.html"), "utf8");
  const script = page.match(/<script>([\s\S]*?)<\/script>/)![1];

  function runScript() {
    // Indirect eval runs it as the page would: as a classic script, at the top level.
    (0, eval)(script);
  }

  /** What the page shows before the app starts, where nothing set means light. */
  function modeBeforeTheApp() {
    return root.dataset.mode ?? "light";
  }

  it("comes first in the head, before anything that draws or loads", () => {
    const head = page.slice(page.indexOf("<head>"), page.indexOf("</head>"));
    expect(head.indexOf("<script>")).toBeLessThan(head.indexOf("<meta name"));
    expect(head).not.toMatch(/<(link rel="stylesheet"|style)/);
  });

  it.each([
    [null, "dark", "light"],
    ["light", "dark", "light"],
    ["dark", "light", "dark"],
    ["system", "dark", "dark"],
    ["system", "light", "light"],
    ["blue", "dark", "light"],
  ] as const)("with %j saved, on a %s device, shows %s mode, as lib/theme.ts does", (saved, device, mode) => {
    if (saved !== null) localStorage.setItem(THEME_KEY, saved);
    standInDevice(device === "dark");

    runScript();

    expect(modeBeforeTheApp()).toBe(mode);
    expect(root.style.colorScheme).toBe(mode);
    expect(modeFor(savedTheme())).toBe(mode);
  });

  it("stays light, quietly, when storage can't be read, as lib/theme.ts does", () => {
    standInDevice(true);
    storageRefuses("getItem");

    expect(runScript).not.toThrow();

    expect(modeBeforeTheApp()).toBe("light");
    expect(modeFor(savedTheme())).toBe("light");
  });
});
