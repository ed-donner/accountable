import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api";
import { user } from "../test-utils";
import { LoadFailed } from "./LoadFailed";

describe("LoadFailed", () => {
  it("shows nothing until there's an error", () => {
    const { container } = render(<LoadFailed error={null} onRetry={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it.each([
    ["a server error", new ApiError("server", "Something went wrong.")],
    ["a refused request", new ApiError("fields", "Check the form.")],
    ["a reply that wasn't readable", new SyntaxError("Unexpected token")],
  ])("says so for %s", async (_name, error) => {
    const onRetry = vi.fn();
    render(<LoadFailed error={error} onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load this.");
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("leaves a lost connection to the message across the top", () => {
    const { container } = render(<LoadFailed error={new ApiError("connection", "Can't reach Accountable.")} onRetry={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("says what's on screen may be out of date when a later read fails", async () => {
    const onRetry = vi.fn();
    render(<LoadFailed keeping error={new ApiError("server", "Something went wrong.")} onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't refresh this, so it may be out of date.");
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows nothing on top of what's kept once there's no error", () => {
    const { container } = render(<LoadFailed keeping error={null} onRetry={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("leaves a lost connection to the message across the top when it's keeping what's on screen too", () => {
    const { container } = render(<LoadFailed keeping error={new ApiError("connection", "Can't reach Accountable.")} onRetry={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
});
