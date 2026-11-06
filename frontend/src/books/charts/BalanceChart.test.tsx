import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { months } from "../test-books";
import { BalanceChart, balanceRange } from "./BalanceChart";

/** jsdom lays nothing out, so this reports every watched element at the chart's size. */
class SizedObserver implements ResizeObserver {
  constructor(private report: ResizeObserverCallback) {}
  observe(target: Element) {
    const contentRect = new DOMRectReadOnly(0, 0, 800, 220);
    this.report([{ target, contentRect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], this);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => vi.stubGlobal("ResizeObserver", SizedObserver));
afterEach(() => vi.unstubAllGlobals());

const RISING = [0, 0, 100000, 100000, 250000, 250000, 250000, 400000, 400000, 400000, 1000000, 1005000];

describe("the balance chart", () => {
  it("draws the twelve months, with the month names on the axis", () => {
    render(<BalanceChart name="Cash" months={months(RISING)} />);
    const chart = within(screen.getByRole("img"));
    for (const { label } of months()) expect(chart.getByText(label)).toBeTruthy();
    expect(screen.getByRole("img").querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick")).toHaveLength(12);
  });

  it("describes itself for a screen reader, ending at this month's balance so far", () => {
    render(<BalanceChart name="Cash" months={months(RISING)} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Cash balance at the end of each of the last 12 months, ending at $10,050.00 so far this month",
    );
  });

  it("has a table of exact balances for anyone who can't see it", () => {
    render(<BalanceChart name="Cash" months={months(RISING)} />);
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(13);
    expect(within(rows[12]).getByRole("rowheader").textContent).toBe("Oct");
    expect(within(rows[12]).getByRole("cell").textContent).toBe("$10,050.00");
    expect(table.className).toContain("sr-only");
  });

  it("keeps a sum past what a number holds exact in its table", () => {
    render(<BalanceChart name="Cash" months={months([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 13510798882111491n])} />);
    expect(screen.getByText("$135,107,988,821,114.91")).toBeTruthy();
  });

  it("draws a solid line and this month's own segment, which ends in one ringed dot", () => {
    const { container } = render(<BalanceChart name="Cash" months={months(RISING)} />);
    // The segment is dashed while it draws in; the dash itself is a constant in the chart.
    expect(container.querySelectorAll("path.recharts-curve.recharts-line-curve")).toHaveLength(2);
    const dots = container.querySelectorAll("circle[r='5']");
    expect(dots).toHaveLength(1);
    expect(dots[0].getAttribute("stroke")).toBe("var(--color-panel)");
    expect(dots[0].getAttribute("fill")).toBe("var(--color-ink)");
  });

  it("draws in the tokens only, never a colour of its own", () => {
    const { container } = render(<BalanceChart name="Cash" months={months(RISING)} />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
    expect(container.querySelector("path.recharts-area-area")?.getAttribute("fill")).toBe("var(--color-sea-green)");
  });

  it("shows a zero line for a negative balance, and none for a positive one", () => {
    const below = render(<BalanceChart name="Cash" months={months([0, -500000, -125000])} />);
    expect(below.container.querySelector("line.recharts-reference-line-line")).not.toBeNull();
    below.unmount();
    const above = render(<BalanceChart name="Cash" months={months(RISING)} />);
    expect(above.container.querySelector("line.recharts-reference-line-line")).toBeNull();
  });

  it("charts an account with nothing in it at $0.00", () => {
    render(<BalanceChart name="Travel" months={months()} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("ending at $0.00 so far");
  });
});

describe("the balance axis", () => {
  it("runs from zero to a round figure above the highest balance", () => {
    expect(balanceRange([0, 42000, 41000])).toEqual({ top: 50000, bottom: 0 });
  });

  it("reaches below zero to a round figure under the lowest", () => {
    expect(balanceRange([-4250, 1200])).toEqual({ top: 2000, bottom: -5000 });
    expect(balanceRange([-4250, -100])).toEqual({ top: 0, bottom: -5000 });
  });

  it("has a range to draw when every balance is zero", () => {
    expect(balanceRange([0, 0])).toEqual({ top: 100, bottom: 0 });
  });
});
