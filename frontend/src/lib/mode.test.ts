import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../../index.html?raw";
import { MODE_KEY, setMode, useMode } from "./mode";

const root = document.documentElement;

beforeEach(() => {
  root.classList.remove("dark");
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the mode (GEN-9, GEN-10)", () => {
  it("is light when <html> has no dark class", () => {
    const { result } = renderHook(() => useMode());
    expect(result.current).toBe("light");
  });

  it("switches to dark: adds the class, saves the choice and updates every component", () => {
    const one = renderHook(() => useMode());
    const two = renderHook(() => useMode());
    act(() => setMode("dark"));
    expect(root).toHaveClass("dark");
    expect(localStorage.getItem(MODE_KEY)).toBe("dark");
    expect([one.result.current, two.result.current]).toEqual(["dark", "dark"]);
  });

  it("switches back to light: removes the class and saves light", () => {
    const { result } = renderHook(() => useMode());
    act(() => setMode("dark"));
    act(() => setMode("light"));
    expect(root).not.toHaveClass("dark");
    expect(localStorage.getItem(MODE_KEY)).toBe("light");
    expect(result.current).toBe("light");
  });

  it("still switches, with no error, when the choice can't be saved", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });
    const { result } = renderHook(() => useMode());
    expect(() => act(() => setMode("dark"))).not.toThrow();
    expect(root).toHaveClass("dark");
    expect(result.current).toBe("dark");
  });
});

describe("the script in index.html, before the page draws (GEN-10)", () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? "";
  const run = () => new Function(script)();

  it("is in the page's head", () => {
    expect(script).not.toBe("");
    expect(indexHtml.indexOf("<script>")).toBeLessThan(indexHtml.indexOf("</head>"));
  });

  it("uses the same storage key as mode.ts", () => {
    expect(script).toContain(`"${MODE_KEY}"`);
  });

  it("opens in dark mode when dark is saved", () => {
    localStorage.setItem(MODE_KEY, "dark");
    run();
    expect(root).toHaveClass("dark");
  });

  it.each([["light"], [null], ["DARK"], ["anything else"]])("opens in light mode when %s is saved", (saved) => {
    if (saved !== null) localStorage.setItem(MODE_KEY, saved);
    run();
    expect(root).not.toHaveClass("dark");
  });

  it("opens in light mode, with no error, when storage can't be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });
    expect(run).not.toThrow();
    expect(root).not.toHaveClass("dark");
  });
});
