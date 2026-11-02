import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { MODE_KEY, savedMode, setMode } from "./mode";

const root = document.documentElement;

function storageRefuses(method: "getItem" | "setItem") {
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new DOMException("The storage is off", "SecurityError");
  });
}

describe("the saved mode", () => {
  it("is light when nothing has been saved", () => {
    expect(savedMode()).toBe("light");
  });

  it("is dark when dark was saved", () => {
    localStorage.setItem(MODE_KEY, "dark");
    expect(savedMode()).toBe("dark");
  });

  it.each(["light", "Dark", "", "blue"])("is light when %j was saved", (value) => {
    localStorage.setItem(MODE_KEY, value);
    expect(savedMode()).toBe("light");
  });

  it("is light when storage can't be read", () => {
    storageRefuses("getItem");
    expect(savedMode()).toBe("light");
  });
});

describe("setting the mode", () => {
  it("shows the page in it and saves the choice", () => {
    setMode("dark");
    expect(root.dataset.mode).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(localStorage.getItem(MODE_KEY)).toBe("dark");

    setMode("light");
    expect(root.dataset.mode).toBe("light");
    expect(root.style.colorScheme).toBe("light");
    expect(localStorage.getItem(MODE_KEY)).toBe("light");
  });

  it("still switches when storage can't be written", () => {
    storageRefuses("setItem");
    expect(() => setMode("dark")).not.toThrow();
    expect(root.dataset.mode).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });
});

describe("the script at the top of index.html", () => {
  const page = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../index.html"), "utf8");
  const script = page.match(/<script>([\s\S]*?)<\/script>/)![1];

  function runScript() {
    // Indirect eval runs it as the page would: as a classic script, at the top level.
    (0, eval)(script);
  }

  it("comes first in the head, before anything that draws or loads", () => {
    const head = page.slice(page.indexOf("<head>"), page.indexOf("</head>"));
    expect(head.indexOf("<script>")).toBeLessThan(head.indexOf("<meta name"));
    expect(head).not.toMatch(/<(link rel="stylesheet"|style)/);
  });

  it("puts a saved dark choice on the page, under the same key as lib/mode.ts", () => {
    localStorage.setItem(MODE_KEY, "dark");
    runScript();
    expect(root.dataset.mode).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it.each(["light", "blue"])("leaves the page alone when %j was saved", (value) => {
    localStorage.setItem(MODE_KEY, value);
    runScript();
    expect(root.dataset.mode).toBeUndefined();
    expect(root.style.colorScheme).toBe("");
  });

  it("leaves the page alone, quietly, when storage can't be read", () => {
    storageRefuses("getItem");
    expect(runScript).not.toThrow();
    expect(root.dataset.mode).toBeUndefined();
  });
});
