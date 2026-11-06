import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { user } from "../../test-utils";
import { ProfitChart } from "./ProfitChart";
import type { ChartMonth } from "./queries";
import { chartMonths, figuresOf, sizeTheChart } from "./test-profit";

beforeEach(sizeTheChart);
afterEach(() => vi.unstubAllGlobals());

const COLUMN = 100;

async function show(months: ChartMonth[] = chartMonths()) {
  const onOpen = vi.fn();
  render(<ProfitChart months={months} onOpen={onOpen} register={() => undefined} />);
  await waitFor(() => expect(chart().querySelectorAll("path.recharts-rectangle").length).toBeGreaterThan(0));
  return onOpen;
}

function chart() {
  return screen.getByRole("img", { name: /^Revenue, expenses by category and profit/ });
}

function bars(fill: string) {
  return [...chart().querySelectorAll<SVGPathElement>(`path.recharts-rectangle[fill="var(--color-${fill})"]`)];
}

function measure(bar: SVGPathElement) {
  const top = Number(bar.getAttribute("y"));
  return {
    column: Math.floor(Number(bar.getAttribute("x")) / COLUMN),
    x: Number(bar.getAttribute("x")),
    top,
    height: Number(bar.getAttribute("height")),
    bottom: top + Number(bar.getAttribute("height")),
  };
}

function zero() {
  return Number(chart().querySelector(".recharts-reference-line-line")?.getAttribute("y1"));
}

/** The profit line's points, as [x, y]: the casing is drawn first, then the line in ink. */
function profitLine() {
  const curves = [...chart().querySelectorAll("path.recharts-line-curve")];
  const line = curves.find((curve) => curve.getAttribute("stroke") === "var(--color-ink)");
  return [...(line?.getAttribute("d") ?? "").matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(([, x, y]) => [
    Number(x),
    Number(y),
  ]);
}

function axisFigures() {
  return [...chart().querySelectorAll(".recharts-cartesian-axis-tick-value")].map((tick) => tick.textContent);
}

const LOSS = { "2026-03": figuresOf(0, { software: 100_000 }) };

describe("the columns", () => {
  it("draw a revenue column for each of the 12 months in ink, 12px wide", async () => {
    await show();
    const revenue = bars("ink");
    expect(revenue).toHaveLength(12);
    expect(revenue.map((bar) => measure(bar).column)).toEqual([...Array(12).keys()]);
    expect(revenue.every((bar) => Number(bar.getAttribute("width")) === 12)).toBe(true);
  });

  it("stack the expenses beside it in the categories' colors, Software at the bottom", async () => {
    await show();
    const software = bars("sea-green").map(measure);
    const travel = bars("coral").map(measure);
    expect(software).toHaveLength(12);
    expect(travel).toHaveLength(12);
    expect(software[0].bottom).toBeGreaterThan(travel[0].bottom);
    expect(software[0].x).toBe(travel[0].x);
    // Beside the revenue column, 2px apart.
    const revenue = measure(bars("ink")[0]);
    expect(Math.abs(software[0].x - revenue.x)).toBe(14);
  });

  it("show only the categories with money in them", async () => {
    await show();
    expect(bars("marigold")).toHaveLength(0);
    expect(bars("cerulean")).toHaveLength(1);
    expect(measure(bars("cerulean")[0]).column).toBe(10);
  });

  it("keep a small segment tall enough to see, and the gap between segments", async () => {
    await show();
    const [office] = bars("cerulean").map(measure);
    expect(office.height).toBeGreaterThanOrEqual(4);
    const travel = measure(bars("coral")[10]);
    expect(office.bottom).toBeLessThan(travel.top + 0.001);
  });

  it("draw nothing for a month with nothing in it", async () => {
    await show(chartMonths({ "2026-01": figuresOf(0) }));
    expect(bars("ink").map((bar) => measure(bar).column)).not.toContain(1);
    expect(bars("sea-green").map((bar) => measure(bar).column)).not.toContain(1);
    expect(bars("ink")).toHaveLength(11);
  });
});

describe("the profit line", () => {
  it("runs through all 12 months, a point at the middle of each", async () => {
    await show();
    const points = profitLine();
    expect(points).toHaveLength(12);
    expect(points.map(([x]) => Math.floor(x / COLUMN))).toEqual([...Array(12).keys()]);
    expect(points.every(([x], index) => Math.abs(x - (index * COLUMN + COLUMN / 2)) < 1)).toBe(true);
    expect(chart().querySelectorAll("circle[r='5']")).toHaveLength(12);
  });

  it("has a casing in the panel color under it", async () => {
    await show();
    const casing = [...chart().querySelectorAll("path.recharts-line-curve")].find(
      (curve) => curve.getAttribute("stroke") === "var(--color-panel)",
    );
    expect(Number(casing?.getAttribute("stroke-width"))).toBeGreaterThan(3);
  });

  it("goes below the zero line for a loss, and the axis runs below zero to fit it", async () => {
    await show(chartMonths(LOSS));
    const [, y] = profitLine()[3];
    expect(y).toBeGreaterThan(zero());
    expect(axisFigures().some((figure) => figure?.startsWith("-$"))).toBe(true);
  });

  it("stays above the zero line with a profit every month, with no figure below zero", async () => {
    await show();
    expect(profitLine().every(([, y]) => y < zero())).toBe(true);
    expect(axisFigures().some((figure) => figure?.startsWith("-"))).toBe(false);
  });
});

describe("the axis, labels and legend", () => {
  it("has $0 and the top as figures", async () => {
    await show();
    const figures = axisFigures();
    expect(figures).toContain("$0");
    expect(figures.length).toBeGreaterThanOrEqual(2);
  });

  it("names every month, with the year under the first and each January, and so far under this month", async () => {
    await show();
    const months = screen.getAllByRole("listitem").filter((item) => item.closest("ol"));
    expect(months).toHaveLength(12);
    expect(months[0].textContent).toBe("Dec2025");
    expect(months[1].textContent).toBe("Jan2026");
    expect(months[2].textContent).toBe("Feb");
    expect(months[11].textContent).toBe("Novso far");
  });

  it("marks the current month with no lighter color on its columns", async () => {
    await show();
    const current = bars("ink")
      .map(measure)
      .find((bar) => bar.column === 11);
    expect(current).toBeTruthy();
    expect(bars("ink").every((bar) => bar.getAttribute("fill-opacity") === null)).toBe(true);
  });
});

describe("the tooltip", () => {
  it("names the month and gives revenue, each category with money, total expenses and the profit", async () => {
    await show();
    fireEvent.mouseMove(within(chart()).getByRole("application"), { clientX: 10 * COLUMN + 50, clientY: 100 });
    const wrapper = await waitFor(() => {
      const found = chart().querySelector<HTMLElement>(".recharts-tooltip-wrapper");
      expect(found?.textContent).toBeTruthy();
      return found!;
    });
    expect(wrapper.textContent).toContain("Profit $7,451.00");
    expect(wrapper.textContent).toContain("October 2026");
    expect(
      within(wrapper)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(["Revenue$9,000.00", "Software$1,200.00", "Travel$300.00", "Office$49.00", "Total expenses$1,549.00"]);
  });
});

describe("the table behind the chart", () => {
  it("has a row for each month and a button for every figure", async () => {
    await show();
    const table = screen.getByRole("table", { name: "Profit and loss for the last 12 months" });
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(within(table).getAllByRole("button")).toHaveLength(12 * 9);
  });

  it("opens the entries behind a figure from its button, and by keyboard", async () => {
    const onOpen = await show();
    await user().click(screen.getByRole("button", { name: "Revenue, March 2026, $5,500.00" }));
    expect(onOpen).toHaveBeenLastCalledWith({
      figure: "revenue",
      name: "Revenue",
      periodLabel: "March 2026",
      from: "2026-03-01",
      to: "2026-03-31",
    });

    const keys = user();
    screen.getByRole("button", { name: "Software, March 2026, $1,200.00" }).focus();
    await keys.keyboard("{Enter}");
    expect(onOpen.mock.lastCall?.[0]).toMatchObject({ figure: "expense_software", name: "Software" });
    screen.getByRole("button", { name: "Profit, February 2026, $3,500.00" }).focus();
    await keys.keyboard(" ");
    expect(onOpen.mock.lastCall?.[0]).toMatchObject({ figure: "profit", from: "2026-02-01", to: "2026-02-28" });
    await keys.click(screen.getByRole("button", { name: "Total expenses, November 2026, $1,500.00" }));
    expect(onOpen.mock.lastCall?.[0]).toMatchObject({ figure: "expenses", to: "2026-11-30" });
  });
});

describe("clicking the chart", () => {
  it("opens that month's revenue from a revenue column", async () => {
    const onOpen = await show();
    fireEvent.click(bars("ink")[4]);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ figure: "revenue", periodLabel: "April 2026" }));
  });

  it("opens that month's entries for a category from its segment", async () => {
    const onOpen = await show();
    fireEvent.click(bars("coral")[2]);
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ figure: "expense_travel", name: "Travel", from: "2026-02-01" }),
    );
  });

  it("opens that month's profit from a point on the line", async () => {
    const onOpen = await show();
    fireEvent.click(chart().querySelectorAll("circle[r='5']")[11]);
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ figure: "profit", name: "Profit", to: "2026-11-30" }),
    );
  });
});
