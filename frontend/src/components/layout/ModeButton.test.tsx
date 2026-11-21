import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MODE_KEY } from "@/lib/mode";
import { renderWithApp } from "@/test/render";
import { ModeButton } from "./ModeButton";

const root = document.documentElement;
const icon = (button: HTMLElement) => button.querySelector("[data-mode-icon]")?.getAttribute("data-mode-icon");

beforeEach(() => {
  root.classList.remove("dark");
  localStorage.clear();
});

describe("ModeButton (GEN-9, spec 2.5)", () => {
  it("in light mode, shows a moon and is named Switch to dark mode, with a tooltip saying so", async () => {
    const { user } = renderWithApp(<ModeButton />);
    const button = screen.getByRole("button", { name: "Switch to dark mode" });
    expect(icon(button)).toBe("moon");
    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Switch to dark mode");
  });

  it("switches to dark and saves the choice, then shows a sun named Switch to light mode", async () => {
    const { user } = renderWithApp(<ModeButton />);
    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(root).toHaveClass("dark");
    expect(localStorage.getItem(MODE_KEY)).toBe("dark");
    const button = screen.getByRole("button", { name: "Switch to light mode" });
    expect(icon(button)).toBe("sun");
  });

  it("goes back to light when clicked again", async () => {
    const { user } = renderWithApp(<ModeButton />);
    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    await user.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(root).not.toHaveClass("dark");
    expect(localStorage.getItem(MODE_KEY)).toBe("light");
    expect(icon(screen.getByRole("button", { name: "Switch to dark mode" }))).toBe("moon");
  });
});
