import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { user } from "../../test-utils";
import type { Dashboard } from "../queries";
import { DealsWonChart } from "./DealsWonChart";
import { FUNNEL_SIDE, REVENUE_MARGIN } from "./geometry";
import { RevenueChart } from "./RevenueChart";
import { SalesFunnel } from "./SalesFunnel";

const WIDTH = 800;
const HEIGHT = 300;
let chartSize = { width: WIDTH, height: HEIGHT };

/** jsdom lays nothing out, so this reports every watched element at the chosen size. */
class SizedObserver implements ResizeObserver {
  constructor(private report: ResizeObserverCallback) {}
  observe(target: Element) {
    const contentRect = new DOMRectReadOnly(0, 0, chartSize.width, chartSize.height);
    this.report([{ target, contentRect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], this);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  chartSize = { width: WIDTH, height: HEIGHT };
  vi.stubGlobal("ResizeObserver", SizedObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const MONTH_NAMES = [
  ["2025-11", "Nov"],
  ["2025-12", "Dec"],
  ["2026-01", "Jan"],
  ["2026-02", "Feb"],
  ["2026-03", "Mar"],
  ["2026-04", "Apr"],
  ["2026-05", "May"],
  ["2026-06", "Jun"],
  ["2026-07", "Jul"],
  ["2026-08", "Aug"],
  ["2026-09", "Sep"],
  ["2026-10", "Oct"],
];

/** A year ending this October, with what was won in each month. */
function year(revenue: number[], deals: number[]): Dashboard["months"] {
  return MONTH_NAMES.map(([month, label], index) => ({ month, label, revenue: revenue[index], deals: deals[index] }));
}

const REVENUE = [8000, 12000, 0, 15000, 9000, 21000, 18000, 0, 26000, 30000, 7000, 42000];
const DEALS = [1, 2, 0, 3, 1, 2, 2, 0, 3, 4, 1, 2];
const MONTHS = year(REVENUE, DEALS);

/** Eleven months of the same, then this month's best. */
function quietThen(quiet: number, best: number) {
  return [...Array.from({ length: 11 }, () => quiet), best];
}

/** Moves the mouse across a chart, the way Recharts tracks it. */
function pointAt(chart: HTMLElement, clientX: number) {
  fireEvent.mouseMove(within(chart).getByRole("application"), { clientX, clientY: HEIGHT / 2 });
}

describe("the revenue chart", () => {
  function revenueChart() {
    return screen.getByRole("img", { name: /^Revenue won per month/ });
  }

  it("describes the year for anyone who can't see it, ending with this month so far", () => {
    render(<RevenueChart months={MONTHS} />);
    expect(revenueChart().getAttribute("aria-label")).toBe(
      "Revenue won per month for the last 12 months, ending at $42,000 so far this month",
    );
  });

  it("lists every month's revenue and deals in a table for screen readers", () => {
    render(<RevenueChart months={MONTHS} />);
    const table = screen.getByRole("table", { name: "Revenue and deals won per month" });
    const rows = within(table)
      .getAllByRole("row")
      .map((row) => Array.from((row as HTMLTableRowElement).cells, (cell) => cell.textContent));

    expect(rows).toHaveLength(13);
    expect(rows[0]).toEqual(["Month", "Revenue won", "Deals won"]);
    expect(rows[1]).toEqual(["Nov", "$8,000", "1"]);
    expect(rows[3]).toEqual(["Jan", "$0", "0"]);
    expect(rows[12]).toEqual(["Oct", "$42,000", "2"]);
  });

  it("labels every month along the bottom", () => {
    render(<RevenueChart months={MONTHS} />);
    for (const [, label] of MONTH_NAMES) expect(within(revenueChart()).getByText(label)).toBeTruthy();
  });

  it.each([
    [10000, ["$2.5k", "$5k", "$7.5k", "$10k"]],
    [15000, ["$5k", "$10k", "$15k", "$20k"]],
    [24000, ["$6.3k", "$12.5k", "$18.8k", "$25k"]],
    [42000, ["$12.5k", "$25k", "$37.5k", "$50k"]],
    [61000, ["$25k", "$50k", "$75k", "$100k"]],
  ])("rounds the scale up to a tidy figure above a best month of %i, in quarters", (best, scale) => {
    render(<RevenueChart months={year(quietThen(1000, best), DEALS)} />);
    expect(
      within(revenueChart())
        .getAllByText(/^\$/)
        .map((tick) => tick.textContent),
    ).toEqual(scale);
  });

  it("shows a month's revenue on hover", async () => {
    render(<RevenueChart months={MONTHS} />);
    pointAt(revenueChart(), REVENUE_MARGIN.left);
    const tip = within(revenueChart());
    expect(await tip.findByText("$8,000")).toBeTruthy();
    // One on the axis, and one in the tip.
    expect(tip.getAllByText("Nov")).toHaveLength(2);
  });

  it("marks this month's revenue as so far on hover", async () => {
    render(<RevenueChart months={MONTHS} />);
    pointAt(revenueChart(), WIDTH - REVENUE_MARGIN.right);
    const tip = within(revenueChart());
    expect(await tip.findByText("Oct so far")).toBeTruthy();
    expect(tip.getByText("$42,000")).toBeTruthy();
  });

  it("shows nothing on hover past the first month, where the fill runs on to the edge", async () => {
    render(<RevenueChart months={MONTHS} />);
    const tip = within(revenueChart());
    pointAt(revenueChart(), REVENUE_MARGIN.left);
    await tip.findByText("$8,000");

    pointAt(revenueChart(), 0);
    await waitFor(() => expect(tip.queryByText("$8,000")).toBeNull());
  });

  it("draws nothing while the panel is too small for the margins, but still describes it", () => {
    chartSize = { width: REVENUE_MARGIN.left + REVENUE_MARGIN.right, height: HEIGHT };
    render(<RevenueChart months={MONTHS} />);
    expect(within(revenueChart()).queryByText("Oct")).toBeNull();
    expect(screen.getByRole("table", { name: "Revenue and deals won per month" })).toBeTruthy();
  });
});

describe("the deals won chart", () => {
  function dealsChart() {
    return screen.getByRole("img", { name: /^Deals won per month/ });
  }

  function scale() {
    return within(dealsChart())
      .queryAllByText(/^\d+$/)
      .map((tick) => tick.textContent);
  }

  it("describes the year for anyone who can't see it, with this month so far", () => {
    render(<DealsWonChart months={MONTHS} />);
    expect(dealsChart().getAttribute("aria-label")).toBe(
      "Deals won per month for the last 12 months, with 2 so far this month",
    );
  });

  it("marks this month's bar as so far", () => {
    render(<DealsWonChart months={MONTHS} />);
    expect(within(dealsChart()).getByText("so far")).toBeTruthy();
  });

  it("labels every other month, ending with this one", () => {
    render(<DealsWonChart months={MONTHS} />);
    const chart = within(dealsChart());
    for (const label of ["Dec", "Feb", "Apr", "Jun", "Aug", "Oct"]) expect(chart.getByText(label)).toBeTruthy();
    for (const label of ["Nov", "Jan", "Mar", "May", "Jul", "Sep"]) expect(chart.queryByText(label)).toBeNull();
  });

  it.each([
    [1, ["1"]],
    [2, ["1", "2"]],
    [3, ["1", "2", "3"]],
    [4, ["2", "4"]],
    [7, ["3", "6", "9"]],
  ])("counts in whole steps, three at most, reaching a best month of %i", (best, steps) => {
    render(<DealsWonChart months={year(REVENUE, quietThen(1, best))} />);
    expect(scale()).toEqual(steps);
  });

  it("shows a month's wins on hover", async () => {
    render(<DealsWonChart months={MONTHS} />);
    pointAt(dealsChart(), 60);
    const tip = within(dealsChart());
    expect(await tip.findByText("1 deal")).toBeTruthy();
    expect(tip.getByText("Nov")).toBeTruthy();
  });

  it("marks this month's wins as so far on hover", async () => {
    render(<DealsWonChart months={MONTHS} />);
    pointAt(dealsChart(), WIDTH - 20);
    const tip = within(dealsChart());
    expect(await tip.findByText("2 deals")).toBeTruthy();
    expect(tip.getByText("Oct so far")).toBeTruthy();
  });
});

describe("the sales funnel", () => {
  const FUNNEL: Dashboard["funnel"] = [
    { stage: "new", value: 68000, carried: null },
    { stage: "qualified", value: 58000, carried: 85 },
    { stage: "proposal", value: 58000, carried: 100 },
    { stage: "negotiation", value: 49000, carried: 84 },
    { stage: "won", value: 49000, carried: 100 },
  ];

  function funnelChart() {
    return screen.getByRole("img", { name: /^Sales funnel/ });
  }

  it("describes each stage's value for anyone who can't see it", () => {
    render(<SalesFunnel stages={FUNNEL} />);
    expect(funnelChart().getAttribute("aria-label")).toBe(
      "Sales funnel, value reaching each stage: New $68,000, Qualified $58,000, Proposal $58,000, Negotiation $49,000, Won $49,000",
    );
  });

  it("names each stage from New down to Won, with the value that reached it", () => {
    render(<SalesFunnel stages={FUNNEL} />);
    const funnel = within(funnelChart());
    for (const stage of ["New", "Qualified", "Proposal", "Negotiation", "Won"]) {
      expect(funnel.getByText(stage)).toBeTruthy();
    }
    expect(funnel.getAllByText("$68,000")).toHaveLength(1);
    expect(funnel.getAllByText("$58,000")).toHaveLength(2);
    expect(funnel.getAllByText("$49,000")).toHaveLength(2);
  });

  it("shows the share carried forward from each stage to the next", () => {
    render(<SalesFunnel stages={FUNNEL} />);
    const shares = within(funnelChart())
      .getAllByText(/%$/)
      .map((share) => share.textContent);
    expect(shares).toEqual(["85%", "100%", "84%", "100%"]);
  });

  it("shows a stage's value on hover", async () => {
    render(<SalesFunnel stages={FUNNEL} />);
    await user().hover(within(funnelChart()).getByText("Negotiation"));
    expect(await within(funnelChart()).findByText("reached Negotiation")).toBeTruthy();
    expect(within(funnelChart()).getAllByText("$49,000")).toHaveLength(3);
  });

  it("draws nothing until there's room beside it for the figures, but still describes it", () => {
    chartSize = { width: FUNNEL_SIDE, height: HEIGHT };
    render(<SalesFunnel stages={FUNNEL} />);
    expect(within(funnelChart()).queryByText("New")).toBeNull();
    expect(funnelChart().getAttribute("aria-label")).toContain("New $68,000");
  });
});
