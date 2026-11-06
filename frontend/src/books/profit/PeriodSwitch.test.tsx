import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { user } from "../../test-utils";
import { PeriodSwitch } from "./PeriodSwitch";
import type { PeriodKind } from "./queries";

type Setup = { backOn?: string | null; forwardOn?: string | null; current?: boolean; label?: string };

function show({ backOn = "2026-02-01", forwardOn = "2026-04-01", current = false, label = "March 2026" }: Setup = {}) {
  const onDay = vi.fn();
  const onKind = vi.fn();
  render(
    <PeriodSwitch
      kind="month"
      onKind={onKind}
      label={label}
      current={current}
      backOn={backOn}
      forwardOn={forwardOn}
      onDay={onDay}
    />,
  );
  return { onDay, onKind };
}

describe("the Month, Quarter and Year switch", () => {
  it("offers the three, with the chosen one pressed for screen readers and semibold", () => {
    show();
    const buttons = screen.getAllByRole("button", { pressed: undefined }).slice(0, 3);
    expect(buttons.map((button) => button.textContent)).toEqual(["Month", "Quarter", "Year"]);
    expect(screen.getByRole("button", { name: "Month", pressed: true }).className).toContain("font-semibold");
    expect(screen.getByRole("button", { name: "Quarter", pressed: false }).className).not.toContain("font-semibold");
  });

  it("tells the page which was chosen, and keeps the day by sending none", async () => {
    const { onKind, onDay } = show();
    await user().click(screen.getByRole("button", { name: "Quarter" }));
    expect(onKind).toHaveBeenCalledWith("quarter");
    expect(onDay).not.toHaveBeenCalled();
  });

  it("keeps the day the page is on across a switch and back", async () => {
    function Page() {
      const [kind, setKind] = useState<PeriodKind>("month");
      const [on, setOn] = useState<string | null>("2026-03-15");
      return (
        <>
          <PeriodSwitch
            kind={kind}
            onKind={setKind}
            label=""
            current={false}
            backOn={null}
            forwardOn={null}
            onDay={setOn}
          />
          <p data-testid="day">{on}</p>
        </>
      );
    }
    render(<Page />);
    await user().click(screen.getByRole("button", { name: "Year" }));
    await user().click(screen.getByRole("button", { name: "Month" }));
    expect(screen.getByTestId("day").textContent).toBe("2026-03-15");
  });

  it("can be reached and pressed with the keyboard", async () => {
    const { onKind } = show();
    const keys = user();
    await keys.tab();
    await keys.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Quarter" }));
    await keys.keyboard("{Enter}");
    expect(onKind).toHaveBeenCalledWith("quarter");
  });
});

describe("the arrows", () => {
  it("send the days the backend gave them", async () => {
    const { onDay } = show();
    await user().click(screen.getByRole("button", { name: "Earlier period" }));
    await user().click(screen.getByRole("button", { name: "Later period" }));
    expect(onDay.mock.calls).toEqual([["2026-02-01"], ["2026-04-01"]]);
  });

  it("are off where the backend gave no day", async () => {
    const { onDay } = show({ backOn: null, forwardOn: null });
    const back = screen.getByRole("button", { name: "Earlier period" }) as HTMLButtonElement;
    const forward = screen.getByRole("button", { name: "Later period" }) as HTMLButtonElement;
    expect([back.disabled, forward.disabled]).toEqual([true, true]);
    expect(back.className).toContain("text-muted");
    await user().click(back);
    expect(onDay).not.toHaveBeenCalled();
  });
});

describe("the label", () => {
  it("names the period, with so far only for the current one", () => {
    show({ label: "November 2026", current: true });
    expect(screen.getByText("November 2026")).toBeTruthy();
    expect(screen.getByText("so far").className).toContain("text-muted");
  });

  it("has no so far for an earlier period", () => {
    show({ label: "March 2026" });
    expect(screen.queryByText("so far")).toBeNull();
  });
});
