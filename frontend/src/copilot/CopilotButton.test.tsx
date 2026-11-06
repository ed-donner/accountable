import { render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { user } from "../test-utils";
import { CopilotButton } from "./CopilotButton";
import { PANEL_ID } from "./CopilotPanel";

function button() {
  return screen.getByRole("button", { name: "Copilot" });
}

/** The button with the open state it's given, as the top bar holds it. */
function Toggling() {
  const [open, setOpen] = useState(false);
  return <CopilotButton open={open} onToggle={() => setOpen(!open)} />;
}

describe("the Copilot button", () => {
  it("is named Copilot for screen readers, and says the panel is closed", () => {
    render(<CopilotButton open={false} onToggle={vi.fn()} />);
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(button().getAttribute("aria-controls")).toBeNull();
  });

  it("says the panel is open, and which it is", () => {
    render(<CopilotButton open onToggle={vi.fn()} />);
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(button().getAttribute("aria-controls")).toBe(PANEL_ID);
  });

  it("asks to open or close the panel when pressed, by pointer or keyboard", async () => {
    const onToggle = vi.fn();
    render(<CopilotButton open={false} onToggle={onToggle} />);
    await user().click(button());
    button().focus();
    await user().keyboard("{Enter}");
    await user().keyboard(" ");
    expect(onToggle).toHaveBeenCalledTimes(3);
  });

  it("toggles between open and closed", async () => {
    render(<Toggling />);
    await user().click(button());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    await user().click(button());
    expect(button().getAttribute("aria-expanded")).toBe("false");
  });

  it("is Sea Green while the panel is open, as the current section is, and in the page color while it's closed", () => {
    const { rerender } = render(<CopilotButton open={false} onToggle={vi.fn()} />);
    expect([...button().classList]).toEqual(expect.arrayContaining(["bg-page", "text-ink"]));
    rerender(<CopilotButton open onToggle={vi.fn()} />);
    expect([...button().classList]).toEqual(expect.arrayContaining(["bg-sea-green", "text-midnight"]));
  });

  it("can be given focus from outside, for when the panel closes", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<CopilotButton ref={ref} open onToggle={vi.fn()} />);
    ref.current!.focus();
    expect(document.activeElement).toBe(button());
  });
});
