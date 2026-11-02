import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MODE_KEY } from "../lib/mode";
import { user } from "../test-utils";
import { ModeButton } from "./ModeButton";

const root = document.documentElement;

function button() {
  return screen.getByRole("button", { name: /^Switch to (dark|light) mode$/ });
}

/** lucide-react names each icon in its class. */
function icon() {
  const svg = button().querySelector("svg");
  return ["moon", "sun"].find((name) => svg?.classList.contains(`lucide-${name}`));
}

describe("the mode button", () => {
  it("shows a moon in light mode and offers dark mode", () => {
    render(<ModeButton />);
    expect(button().getAttribute("aria-label")).toBe("Switch to dark mode");
    expect(icon()).toBe("moon");
  });

  it("starts from a saved dark choice", () => {
    localStorage.setItem(MODE_KEY, "dark");
    render(<ModeButton />);
    expect(button().getAttribute("aria-label")).toBe("Switch to light mode");
    expect(icon()).toBe("sun");
  });

  it("switches to dark mode and back on a click, saving each choice", async () => {
    render(<ModeButton />);

    await user().click(button());
    expect(root.dataset.mode).toBe("dark");
    expect(localStorage.getItem(MODE_KEY)).toBe("dark");
    expect(button().getAttribute("aria-label")).toBe("Switch to light mode");
    expect(icon()).toBe("sun");

    await user().click(button());
    expect(root.dataset.mode).toBe("light");
    expect(localStorage.getItem(MODE_KEY)).toBe("light");
    expect(button().getAttribute("aria-label")).toBe("Switch to dark mode");
    expect(icon()).toBe("moon");
  });

  it.each(["{Enter}", " "])("switches with %j from the keyboard", async (key) => {
    render(<ModeButton />);
    const keyboard = user();
    await keyboard.tab();
    expect(document.activeElement).toBe(button());

    await keyboard.keyboard(key);
    expect(root.dataset.mode).toBe("dark");
    expect(button().getAttribute("aria-label")).toBe("Switch to light mode");

    await keyboard.keyboard(key);
    expect(root.dataset.mode).toBe("light");
  });
});
