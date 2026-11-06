import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { figures as figuresOf } from "./balance";
import { BalanceBars, SegmentTip } from "./BalanceBars";
import { balancesReply, emptyBalances, sizeTheChart } from "./test-balance";

beforeEach(sizeTheChart);
afterEach(() => vi.unstubAllGlobals());

const DAY = "2026-10-31";

const figures = (changes: Record<string, string> = {}) => figuresOf(balancesReply(DAY, changes).accounts);

async function show(all = figures()) {
  render(<BalanceBars figures={all} day={DAY} />);
  await waitFor(() => expect(segments().length).toBeGreaterThan(0));
}

function chart() {
  return screen.getByRole("img", { name: "The two sides of the balance sheet on Oct 31, 2026" });
}

function segments() {
  return [...chart().querySelectorAll<SVGPathElement>("path.recharts-rectangle")];
}

function measure(fill: string) {
  return segments()
    .filter((segment) => segment.getAttribute("fill") === `var(--color-${fill})`)
    .map((segment) => {
      const top = Number(segment.getAttribute("y"));
      return { x: Number(segment.getAttribute("x")), top, bottom: top + Number(segment.getAttribute("height")) };
    });
}

/** Each bar's top and bottom, left bar first, from the segments x-position. */
function bars() {
  const all = segments().map((segment) => ({
    x: Number(segment.getAttribute("x")),
    top: Number(segment.getAttribute("y")),
    bottom: Number(segment.getAttribute("y")) + Number(segment.getAttribute("height")),
  }));
  const middle = Math.min(...all.map((each) => each.x)) + 200;
  return [all.filter((each) => each.x < middle), all.filter((each) => each.x >= middle)].map((side) => ({
    top: Math.min(...side.map((each) => each.top)),
    bottom: Math.max(...side.map((each) => each.bottom)),
  }));
}

describe("BalanceBars", () => {
  it("draws every account in its own color, 120px wide", async () => {
    await show();
    for (const fill of ["sea-green", "marigold", "coral", "cerulean", "ink", "bar-soft"]) {
      const found = measure(fill);
      expect(found, fill).toHaveLength(1);
    }
    expect(new Set(segments().map((segment) => Number(segment.getAttribute("width"))))).toEqual(new Set([120]));
  });

  it("stacks each side in the columns' order from the bottom up", async () => {
    await show();
    expect(measure("sea-green")[0].top).toBeGreaterThan(measure("marigold")[0].top);
    expect(measure("coral")[0].top).toBeGreaterThan(measure("cerulean")[0].top);
    expect(measure("cerulean")[0].top).toBeGreaterThan(measure("ink")[0].top);
    expect(measure("ink")[0].top).toBeGreaterThan(measure("bar-soft")[0].top);
  });

  it("makes the two bars the same height when the books balance", async () => {
    await show();
    const [left, right] = bars();
    expect(left.bottom).toBeCloseTo(right.bottom, 3);
    expect(left.top).toBeCloseTo(right.top, 3);
  });

  it("makes them differ when the sides do", async () => {
    await show(figures({ cash: "3230000" }));
    const [left, right] = bars();
    expect(left.top).toBeGreaterThan(right.top + 50);
  });

  it("draws no segment for an account at zero or below", async () => {
    await show(figures({ cash: "-425000", revenue: "100000" }));
    expect(measure("sea-green")).toEqual([]);
    expect(measure("bar-soft")).toEqual([]);
    expect(measure("marigold")).toHaveLength(1);
  });

  it("keeps a segment too small to see 4px tall", async () => {
    await show(figures({ tax_payable: "100", payable: "900000" }));
    const [small] = measure("cerulean");
    expect(small.bottom - small.top).toBeGreaterThanOrEqual(4);
  });

  it("names each side under its bar and the money on the axis", async () => {
    await show();
    expect(chart().textContent).toContain("What the business owns");
    expect(chart().textContent).toContain("What it owes and what's the owner's");
    expect(chart().textContent).toContain("$0");
  });

  it("gives every figure and both totals in a table behind the chart", async () => {
    await show();
    const table = screen.getByRole("table", { name: "Balance sheet on Oct 31, 2026" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent).join("|"))).toEqual([
      "Cash|What the business owns|$62,300.00",
      "Receivable|What the business owns|$27,100.00",
      "Payable|What it owes and what's the owner's|$9,100.00",
      "Tax payable|What it owes and what's the owner's|$1,800.00",
      "Owner's equity|What it owes and what's the owner's|$40,000.00",
      "Profit to date|What it owes and what's the owner's|$38,500.00",
      "Total|What the business owns|$89,400.00",
      "Total|What it owes and what's the owner's|$89,400.00",
    ]);
  });

  it("says nothing is in the books, with no bars, when every figure is zero", () => {
    render(<BalanceBars figures={figuresOf(emptyBalances(DAY).accounts)} day={DAY} />);
    expect(screen.getByText("Nothing in the books by this date.")).toBeTruthy();
    expect(segments()).toEqual([]);
  });
});

describe("SegmentTip", () => {
  it("gives the account, its real figure and the day", () => {
    render(<SegmentTip active payload={[{ name: "Receivable" }]} figures={figures()} day={DAY} />);
    expect(screen.getByText("$27,100.00")).toBeTruthy();
    expect(screen.getByText("Receivable on Oct 31, 2026")).toBeTruthy();
  });

  it("gives a figure below zero its minus sign", () => {
    render(<SegmentTip active payload={[{ name: "Cash" }]} figures={figures({ cash: "-425000" })} day={DAY} />);
    expect(screen.getByText("-$4,250.00")).toBeTruthy();
  });

  it("shows nothing when not pointed at anything", () => {
    const { container } = render(<SegmentTip payload={[{ name: "Cash" }]} figures={figures()} day={DAY} />);
    expect(container.textContent).toBe("");
  });
});
