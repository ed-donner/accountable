import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user } from "../test-utils";
import { CashFlowRow } from "./CashFlowRow";
import { COLUMN, TODAY, cashFlowReply, sizeTheChart } from "./test-cash-flow";
import type { MonthReply } from "./queries";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
  sizeTheChart();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const PAST = [...Array(11).keys()];
const THIS_MONTH = 11;
const FORECAST = [12, 13, 14];

async function show(reply = cashFlowReply()) {
  mockApi({ "GET /cash-flow": reply });
  renderApp(<CashFlowRow />);
  await waitFor(() =>
    expect(chart().querySelectorAll("path.recharts-line-curve, path.recharts-rectangle").length).toBeGreaterThan(0),
  );
}

function chart() {
  return screen.getByRole("img", { name: /^Money in and out each month/ });
}

function bars(fill: string) {
  return [...chart().querySelectorAll<SVGPathElement>(`path.recharts-rectangle[fill="var(--color-${fill})"]`)];
}

function measure(bar: SVGPathElement) {
  const top = Number(bar.getAttribute("y"));
  return {
    column: Math.floor(Number(bar.getAttribute("x")) / COLUMN),
    top,
    bottom: top + Number(bar.getAttribute("height")),
  };
}

function zero() {
  return Number(chart().querySelector(".recharts-reference-line-line")?.getAttribute("y1"));
}

function columns(fill: string) {
  return bars(fill).map((bar) => measure(bar).column);
}

function at(fill: string, column: number) {
  const found = bars(fill)
    .map(measure)
    .find((bar) => bar.column === column);
  if (!found) throw new Error(`No ${fill} bar in column ${column}`);
  return found;
}

/** The balance line's points, as [x, y], solid then dashed. */
function lines() {
  const curves = [...chart().querySelectorAll("path.recharts-line-curve")];
  const points = (curve: Element | undefined) =>
    [...(curve?.getAttribute("d") ?? "").matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]);
  return {
    solid: points(curves.find((curve) => !curve.getAttribute("stroke-dasharray"))),
    dashed: points(curves.find((curve) => curve.getAttribute("stroke-dasharray"))),
  };
}

function middleOf(column: number) {
  return column * COLUMN + COLUMN / 2;
}

function pointAt(column: number) {
  fireEvent.mouseMove(within(chart()).getByRole("application"), { clientX: middleOf(column), clientY: 100 });
}

async function tip() {
  const found = await waitFor(() => {
    const wrapper = chart().querySelector<HTMLElement>(".recharts-tooltip-wrapper");
    expect(wrapper?.textContent).toBeTruthy();
    return wrapper!;
  });
  return {
    text: found.textContent,
    rows: within(found)
      .getAllByRole("listitem")
      .map((row) => row.textContent),
  };
}

function labels() {
  return within(screen.getByRole("region", { name: "Cash flow" }))
    .getAllByRole("listitem")
    .filter((item) => item.closest("ol"));
}

function balances(changes: Record<number, string | null>): Record<string, Partial<MonthReply>> {
  const months = cashFlowReply().months;
  return Object.fromEntries(
    Object.entries(changes).map(([index, cents]) => [
      months[Number(index)].month,
      { balance_cents: cents, balance_with_deals_cents: cents },
    ]),
  );
}

describe("the bars", () => {
  it("raise money in from the zero line and drop money out below it, for each month with any", async () => {
    await show();
    expect(columns("sea-green")).toEqual([...PAST, THIS_MONTH]);
    expect(columns("coral")).toEqual([...PAST, THIS_MONTH]);
    for (const column of [...PAST, THIS_MONTH]) {
      expect(at("sea-green", column).bottom).toBeCloseTo(zero());
      expect(at("coral", column).top).toBeCloseTo(zero());
    }
  });

  it("carry this month's still expected past what's moved so far, after a 2px gap, in the soft colors", async () => {
    await show();
    expect(at("sea-green-soft", THIS_MONTH).bottom).toBeCloseTo(at("sea-green", THIS_MONTH).top - 2);
    expect(at("coral-soft", THIS_MONTH).top).toBeCloseTo(at("coral", THIS_MONTH).bottom + 2);
  });

  it("draw the forecast months in the soft colors throughout", async () => {
    await show();
    expect(columns("sea-green-soft")).toEqual([THIS_MONTH, ...FORECAST]);
    expect(columns("coral-soft")).toEqual([THIS_MONTH, ...FORECAST]);
    for (const column of FORECAST) {
      expect(at("sea-green-soft", column).bottom).toBeCloseTo(zero());
      expect(at("coral-soft", column).top).toBeCloseTo(zero());
    }
  });

  it("draw a sliver too small to see long enough to see and point at", async () => {
    await show(cashFlowReply({ months: { "2026-03": { in_cents: "1", out_cents: "1" } } }));
    expect(at("sea-green", 3).bottom - at("sea-green", 3).top).toBeGreaterThanOrEqual(4);
    expect(at("coral", 3).bottom - at("coral", 3).top).toBeGreaterThanOrEqual(4);
  });
});

describe("the balance line", () => {
  it("is solid to last month's point, ringed there, and dashed from it to the end of the forecast", async () => {
    await show();
    const { solid, dashed } = lines();
    expect(solid.map(([x]) => x)).toEqual([...PAST].map(middleOf));
    expect(dashed.map(([x]) => x)).toEqual([10, THIS_MONTH, ...FORECAST].map(middleOf));
    expect(dashed[0]).toEqual(solid[solid.length - 1]);
    const dot = chart().querySelector("circle")!;
    expect([Number(dot.getAttribute("cx")), dot.getAttribute("fill"), dot.getAttribute("stroke")]).toEqual([
      middleOf(10),
      "var(--color-ink)",
      "var(--color-panel)",
    ]);
  });

  it("starts in the opening balance's month", async () => {
    await show(cashFlowReply({ months: balances({ 0: null, 1: null, 2: null }) }));
    expect(lines().solid.map(([x]) => x)).toEqual([3, 4, 5, 6, 7, 8, 9, 10].map(middleOf));
  });

  it("starts at this month's point, dashed, with the opening balance this month", async () => {
    await show(cashFlowReply({ months: balances(Object.fromEntries(PAST.map((index) => [index, null]))) }));
    const { solid, dashed } = lines();
    expect(solid).toEqual([]);
    expect(dashed.map(([x]) => x)).toEqual([THIS_MONTH, ...FORECAST].map(middleOf));
  });

  it("isn't drawn without an opening balance", async () => {
    await show(cashFlowReply({ opening: false }));
    expect(lines()).toEqual({ solid: [], dashed: [] });
  });

  it("keeps the axis's figures apart, with $0 and the end below zero, however far below zero it runs", async () => {
    // Every balance $500k overdrawn, while money in and out run to a few thousand above and below zero.
    await show(
      cashFlowReply({
        months: balances(Object.fromEntries([...Array(15).keys()].map((index) => [index, "-50000000"]))),
      }),
    );
    const ticks = [...chart().querySelectorAll(".recharts-cartesian-axis-tick-value")].map((tick) => ({
      text: tick.textContent,
      y: Number(tick.closest("text")?.getAttribute("y")),
    }));
    expect(ticks.map((tick) => tick.text)).toEqual(expect.arrayContaining(["$0", "-$500k"]));
    const ys = ticks.map((tick) => tick.y).sort((a, b) => a - b);
    for (let index = 1; index < ys.length; index++) expect(ys[index] - ys[index - 1]).toBeGreaterThanOrEqual(16);
  });

  it("can go below zero, which the axis shows with its minus sign", async () => {
    await show(cashFlowReply({ months: balances({ 9: "-3500000" }) }));
    const ticks = [...chart().querySelectorAll(".recharts-cartesian-axis-tick-value")].map((tick) => tick.textContent);
    expect(ticks).toContain("-$50k");
    expect(lines().solid[9][1]).toBeGreaterThan(zero());
  });
});

describe("the likely deals' band", () => {
  it("is drawn only with the switch on, and leaves the line, the bars and the axis as they were", async () => {
    // Deals that reach $300k by February, well over the balance, so the axis has made room for them.
    await show(cashFlowReply({ months: { "2027-02": { balance_with_deals_cents: "30000000" } } }));
    const before = {
      lines: lines(),
      bars: bars("sea-green-soft").map(measure),
      html: chart().querySelector(".recharts-yAxis")?.outerHTML,
    };
    expect(chart().querySelector(".recharts-area-area")).toBeNull();

    await user().click(screen.getByRole("switch", { name: "Likely deals" }));

    const band = await waitFor(() => chart().querySelector(".recharts-area-area")!);
    expect(band.getAttribute("fill")).toBe("var(--color-marigold-soft)");
    expect(lines()).toEqual(before.lines);
    expect(bars("sea-green-soft").map(measure)).toEqual(before.bars);
    expect(chart().querySelector(".recharts-yAxis")?.outerHTML).toBe(before.html);
  });

  it("runs from last month's point, between the balance and the balance with the deals", async () => {
    await show();
    await user().click(screen.getByRole("switch", { name: "Likely deals" }));
    const band = await waitFor(() => chart().querySelector(".recharts-area-area")!);
    const xs = [...(band.getAttribute("d") ?? "").matchAll(/[ML]([\d.]+),/g)].map(([, x]) => Number(x));
    expect(Math.min(...xs)).toBe(middleOf(10));
    expect(Math.max(...xs)).toBe(middleOf(14));
  });
});

describe("the months", () => {
  it("are named under their columns, with the year under the first and each January, and this month so far", async () => {
    await show();
    expect(labels().map((label) => label.textContent)).toEqual([
      "Dec2025",
      "Jan2026",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Novso far",
      "Dec",
      "Jan2027",
      "Feb",
    ]);
  });

  it("are buttons for this month and the forecast, and plain text for the past", async () => {
    await show();
    const buttons = labels().flatMap((label) => within(label).queryAllByRole("button"));
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Still expected in November 2026",
      "Expected in December 2026",
      "Expected in January 2027",
      "Expected in February 2027",
    ]);
  });
});

describe("the tooltip", () => {
  it("gives a past month's money in and out, with how many, and its balance at the end", async () => {
    await show();
    pointAt(9);
    const shown = await tip();
    expect(shown.text).toMatch(/^\$62,500\.00Cash at the end of September/);
    expect(shown.rows).toEqual(["Money in 3 payments$3,900.00", "Money out 2 bills$1,200.00"]);
  });

  it("gives this month's money so far apart from what's still expected", async () => {
    await show();
    pointAt(THIS_MONTH);
    const shown = await tip();
    expect(shown.text).toMatch(/^\$68,500\.00Expected cash at the end of NovemberSo far.*Still expected/);
    expect(shown.rows).toEqual([
      "Money in 3 payments$1,500.00",
      "Money out 2 bills$200.00",
      "Expected in 4 invoices$2,500.00",
      "Expected out 1 bill$600.00",
    ]);
  });

  it("gives a forecast month's money expected, and the likely deals only with the switch on", async () => {
    await show();
    pointAt(12);
    expect((await tip()).rows).toEqual(["Expected in 4 invoices$2,000.00", "Expected out 1 bill$800.00"]);

    await user().click(screen.getByRole("switch", { name: "Likely deals" }));
    pointAt(13);
    pointAt(12);
    await waitFor(async () =>
      expect((await tip()).rows).toEqual([
        "Expected in 4 invoices$2,000.00",
        "Expected out 1 bill$800.00",
        "Likely deals 2 deals$3,000.00",
        "With likely deals$73,700.00",
      ]),
    );
  });

  it("names the month without a balance to lead with, with no opening balance", async () => {
    await show(cashFlowReply({ opening: false }));
    pointAt(9);
    expect((await tip()).text).toMatch(/^September 2026Money in/);
  });
});
