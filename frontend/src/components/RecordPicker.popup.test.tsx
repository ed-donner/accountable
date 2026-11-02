import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { user } from "../test-utils";
import { RecordPicker } from "./RecordPicker";

function show() {
  render(
    <RecordPicker
      label="Organization"
      noun="organization"
      value={null}
      options={[{ id: 1, name: "Harbor & Pine" }]}
      onChange={vi.fn()}
    />,
  );
  return screen.getByRole("combobox", { name: "Organization" });
}

describe("the picker's button", () => {
  it("says it's closed, and points at nothing, before it's opened", () => {
    const button = show();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.hasAttribute("aria-controls")).toBe(false);
  });

  it("points at the popup it opens", async () => {
    const button = show();
    await user().click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const popup = document.getElementById(button.getAttribute("aria-controls")!);
    expect(popup?.contains(screen.getByRole("listbox"))).toBe(true);
  });
});
