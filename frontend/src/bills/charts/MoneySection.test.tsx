import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BarShapeProps } from "recharts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user, type Call } from "../../test-utils";
import type { Category, DueBill, MoneyFigures, SpendingMonth } from "../queries";
import { dueDays } from "./DueTimeline";
import { BillsMoney } from "./MoneySection";
import { LEAST_HEIGHT, StackSegment, stackScale } from "./StackSegment";

const WIDTH = 600;
const HEIGHT = 240;

/** jsdom lays nothing out, so this reports every watched element at one size. */
class SizedObserver implements ResizeObserver {
  constructor(private report: ResizeObserverCallback) {}
  observe(target: Element) {
    const contentRect = new DOMRectReadOnly(0, 0, WIDTH, HEIGHT);
    this.report([{ target, contentRect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], this);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 12, 0) });
  vi.stubGlobal("ResizeObserver", SizedObserver);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const NOTHING: Record<Category, number> = { software: 0, contractors: 0, travel: 0, office: 0, marketing: 0, other: 0 };
const LABELS = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];

/** Each month's spending, sent as digits as the backend sends it. */
function year(spent: Partial<Record<string, Partial<Record<Category, number | bigint>>>> = {}): SpendingMonth[] {
  return LABELS.map((label, index) => {
    const month = `${index < 2 ? 2025 : 2026}-${String(((index + 10) % 12) + 1).padStart(2, "0")}`;
    const cents = { ...NOTHING, ...spent[label] };
    const total = Object.values(cents).reduce<bigint>((sum, value) => sum + BigInt(value), 0n);
    const categories = Object.fromEntries(Object.entries(cents).map(([key, value]) => [key, String(value)]));
    return { month, label, total_cents: String(total), categories: categories as Record<Category, string> };
  });
}

function due(id: number, supplier: string, number: string, date: string, category: Category, cents: number): DueBill {
  return { id, supplier, bill_number: number, due_date: date, category, total_cents: cents };
}

const DUE = [
  due(1, "Northwind Software", "NS-10483", "2026-10-31", "software", 135005),
  due(2, "Kingsgate Properties", "KP-2616", "2026-11-02", "office", 450000),
  due(3, "Wayfarer Travel", "WT77133", "2026-11-02", "travel", 52260),
  due(4, "Fieldstone Development", "FD-0329", "2026-11-30", "contractors", 903750),
];

const FIGURES: MoneyFigures = {
  today: "2026-10-31",
  owed: { total_cents: "2633710", count: 10 },
  overdue: { total_cents: "712993", count: 3 },
  due: { total_cents: "1541015", count: 4, bills: DUE },
  months: year({
    Jan: { software: 173600, other: 835900 },
    Oct: { software: 179700, contractors: 903750, office: 450000 },
  }),
};

const EMPTY: MoneyFigures = {
  today: "2026-10-31",
  owed: { total_cents: "0", count: 0 },
  overdue: { total_cents: "0", count: 0 },
  due: { total_cents: "0", count: 0, bills: [] },
  months: year(),
};

function show(figures: MoneyFigures | (() => { status?: number; body: unknown })) {
  const calls = mockApi({ "GET /bills/dashboard": figures });
  renderApp(<BillsMoney />);
  return calls;
}

function panel(name: string) {
  return within(screen.getByRole("region", { name }));
}

function reads(calls: Call[]) {
  return calls.filter((call) => call.path === "/bills/dashboard").length;
}

function segments(chart: HTMLElement) {
  return [...chart.querySelectorAll("path.recharts-rectangle")] as SVGPathElement[];
}

/**
 * Recharts draws a chart's axes, bars and labels a render after the figures above it, and on
 * a busy test run that render can come late, so a test waits for the segments it reads.
 */
async function drawnSegments(chart: () => HTMLElement, count: number) {
  await waitFor(() => expect(segments(chart())).toHaveLength(count));
  return segments(chart());
}

function leftEdge(segment: SVGPathElement) {
  return Number(/^M\s*([\d.]+)/.exec(segment.getAttribute("d") ?? "")?.[1]);
}

/** A segment with square corners is drawn as a box: across, down its height, back. */
function heightOf(segment: SVGPathElement) {
  return Number(/v\s*([\d.]+)/.exec(segment.getAttribute("d") ?? "")?.[1]);
}

describe("bills' side of the Money section", () => {
  it("has what we owe, then the spending under it", async () => {
    show(FIGURES);
    await screen.findByRole("region", { name: "What we owe" });
    expect(panel("What we owe").getByRole("heading", { name: "Due in the next 30 days" })).toBeTruthy();
    expect(panel("Spending by category").getByRole("heading", { name: "Spending in October" })).toBeTruthy();
  });

  it("shows what we owe and what's overdue with their cents and counts, each opening Bills under its filter", async () => {
    show(FIGURES);
    const owed = await screen.findByRole("link", { name: /^What we owe/ });
    expect(owed.textContent).toBe("What we owe$26,337.1010 unpaid bills");
    expect(owed.getAttribute("href")).toBe("/bills");
    const overdue = screen.getByRole("link", { name: /^Overdue/ });
    expect(overdue.textContent).toBe("Overdue$7,129.933 bills");
    expect(overdue.getAttribute("href")).toBe("/bills?status=overdue");
  });

  it("shows sums past what a JavaScript number holds to the cent", async () => {
    // 46 bills at the most an amount and its tax can each be, and one for a cent.
    const exact = "9200000000000001";
    show({
      ...FIGURES,
      owed: { total_cents: exact, count: 47 },
      overdue: { total_cents: exact, count: 47 },
      due: { ...FIGURES.due, total_cents: exact },
      months: year({ Oct: { software: BigInt(exact) } }),
    });
    const owed = await screen.findByRole("link", { name: /^What we owe/ });
    expect(owed.textContent).toBe("What we owe$92,000,000,000,000.0147 unpaid bills");
    expect(screen.getByRole("link", { name: /^Overdue/ }).textContent).toBe("Overdue$92,000,000,000,000.0147 bills");
    expect(screen.getByTestId("due-total").textContent).toBe("$92,000,000,000,000.01");
    expect(screen.getByTestId("spent-this-month").textContent).toBe("$92,000,000,000,000.01");
    const table = within(screen.getByRole("table", { name: "Spending by category for the last 12 months" }));
    expect(table.getAllByRole("row")[12].textContent).toBe(
      "Oct so far$92,000,000,000,000.01$0.00$0.00$0.00$0.00$0.00$92,000,000,000,000.01",
    );
  });

  it("shows $0.00 for both with no unpaid bills", async () => {
    show(EMPTY);
    expect((await screen.findByRole("link", { name: /^What we owe/ })).textContent).toBe(
      "What we owe$0.000 unpaid bills",
    );
    expect(screen.getByRole("link", { name: /^Overdue/ }).textContent).toBe("Overdue$0.000 bills");
  });

  it("reads its figures again once the day has passed the reply's, as the dashboard does", async () => {
    vi.setSystemTime(new Date(2026, 9, 31, 23, 59));
    let serverDay = "2026-10-31";
    const calls = show(() => ({ body: { ...FIGURES, today: serverDay } }));
    await screen.findByRole("link", { name: /^What we owe/ });

    serverDay = "2026-11-01";
    vi.setSystemTime(new Date(2026, 10, 1, 0, 1));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(reads(calls)).toBe(2));
  });

  it("says when its figures couldn't be read, and tries again", async () => {
    let failing = true;
    const calls = show(() =>
      failing ? { status: 500, body: { detail: "Something went wrong." } } : { body: FIGURES },
    );
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    failing = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /^What we owe/ })).toBeTruthy();
    expect(reads(calls)).toBe(2);
  });
});

describe("due in the next 30 days", () => {
  function timeline() {
    return panel("What we owe").getByRole("img", { name: /due from today/ });
  }

  it("gives the total due and how many, over a timeline from today", async () => {
    show(FIGURES);
    expect((await screen.findByTestId("due-total")).textContent).toBe("$15,410.15");
    expect(panel("What we owe").getByText("4 bills")).toBeTruthy();
    expect(timeline().getAttribute("aria-label")).toBe("4 bills due from today to Nov 30, 2026, each at its due date");
    const axis = within(timeline());
    for (const label of ["Today", "Nov 7", "Nov 14", "Nov 21", "Nov 28"])
      expect(await axis.findByText(label)).toBeTruthy();
  });

  it("draws each bill in its category's color, with bills due on one day stacked", async () => {
    show(FIGURES);
    const drawn = await drawnSegments(timeline, 4);
    expect(drawn.map((segment) => segment.getAttribute("fill"))).toEqual([
      "var(--color-sea-green)",
      "var(--color-cerulean)",
      "var(--color-marigold)",
      "var(--color-coral)",
    ]);
    // The office and travel bills are both due Nov 2, so they share a column.
    expect(leftEdge(drawn[3])).toBe(leftEdge(drawn[1]));
    expect(leftEdge(drawn[0])).toBeLessThan(leftEdge(drawn[1]));
  });

  it("shows the bill pointed at, not the whole day", async () => {
    show(FIGURES);
    fireEvent.mouseEnter((await drawnSegments(timeline, 4))[3]);
    await screen.findByText("Wayfarer Travel WT77133");
    const tip = timeline().querySelector<HTMLElement>(".recharts-tooltip-wrapper")!;
    expect(tip.textContent).toBe("$522.60Wayfarer Travel WT77133Travel");
  });

  it("draws a small bill on a day with a large one tall enough to see and point at", async () => {
    // At this size, $49 on a $4,500 day is under 2px, less than the gap above the bill under it.
    const under = due(5, "Inkwell Print", "IP-87", "2026-11-02", "marketing", 4900);
    const over = due(6, "Inkwell Print", "IP-88", "2026-11-02", "marketing", 4900);
    show({ ...FIGURES, due: { total_cents: "459800", count: 3, bills: [under, DUE[1], over] } });
    const drawn = await drawnSegments(timeline, 3);
    expect(heightOf(drawn[0])).toBeGreaterThanOrEqual(4);
    fireEvent.mouseEnter(drawn[2]);
    expect(await screen.findByText("Inkwell Print IP-88")).toBeTruthy();
  });

  it("lists the bills for anyone who can't see the timeline", async () => {
    show(FIGURES);
    const table = within(await screen.findByRole("table", { name: "Bills due in the next 30 days" }));
    const rows = table.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Oct 31, 2026Northwind SoftwareNS-10483Software$1,350.05",
      "Nov 2, 2026Kingsgate PropertiesKP-2616Office$4,500.00",
      "Nov 2, 2026Wayfarer TravelWT77133Travel$522.60",
      "Nov 30, 2026Fieldstone DevelopmentFD-0329Contractors$9,037.50",
    ]);
  });

  it("says so when none are due", async () => {
    show({ ...FIGURES, due: { total_cents: "0", count: 0, bills: [] } });
    expect(await screen.findByText("No bills due in the next 30 days.")).toBeTruthy();
    expect(screen.getByTestId("due-total").textContent).toBe("$0.00");
  });

  it("covers today and the 30 days after it, each day's bills in due date order", () => {
    const days = dueDays(DUE, "2026-10-31");
    expect(days).toHaveLength(31);
    expect([days[0].date, days[30].date]).toEqual(["2026-10-31", "2026-11-30"]);
    expect(days[2].bills.map((bill) => bill.id)).toEqual([2, 3]);
    expect(dueDays([], "2028-02-15")[14].date).toBe("2028-02-29");
  });
});

describe("spending by category", () => {
  function chart() {
    return panel("Spending by category").getByRole("img", { name: /^Spending by category/ });
  }

  it("gives this month's spending beside last month's, over a column for each of the last 12 months", async () => {
    show(FIGURES);
    await screen.findByRole("link", { name: /^What we owe/ });
    const spending = panel("Spending by category");
    expect(spending.getByTestId("spent-this-month").textContent).toBe("$15,334.50");
    expect(spending.getByTestId("spent-last-month").textContent).toBe("September $0.00");
    expect(chart().getAttribute("aria-label")).toBe(
      "Spending by category for the last 12 months, with $15,334.50 so far this month",
    );
    const drawn = within(chart());
    for (const label of LABELS) expect(await drawn.findByText(label)).toBeTruthy();
    expect(await drawn.findByText("so far")).toBeTruthy();
  });

  it("stacks each month's categories in their order, from Software at the bottom", async () => {
    show(FIGURES);
    expect((await drawnSegments(chart, 5)).map((segment) => segment.getAttribute("fill"))).toEqual([
      "var(--color-sea-green)",
      "var(--color-sea-green)",
      "var(--color-marigold)",
      "var(--color-cerulean)",
      "var(--color-bar-soft)",
    ]);
  });

  it("draws a small category on a large one", async () => {
    show({ ...FIGURES, months: year({ Oct: { software: 900000, other: 4000 } }) });
    expect((await drawnSegments(chart, 2)).map((segment) => segment.getAttribute("fill"))).toEqual([
      "var(--color-sea-green)",
      "var(--color-bar-soft)",
    ]);
  });

  it("shows each category's total and the month's for the month pointed at", async () => {
    show(FIGURES);
    await drawnSegments(chart, 5);
    fireEvent.mouseMove(within(chart()).getByRole("application"), { clientX: WIDTH - 70, clientY: HEIGHT / 2 });
    const tip = within(chart().querySelector<HTMLElement>(".recharts-tooltip-wrapper")!);
    expect(await tip.findByText("Oct so far")).toBeTruthy();
    expect(tip.getByText("$15,334.50")).toBeTruthy();
    expect(tip.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Software$1,797.00",
      "Contractors$9,037.50",
      "Travel$0.00",
      "Office$4,500.00",
      "Marketing$0.00",
      "Other$0.00",
    ]);
  });

  it("names the six categories beside their swatches, in order", async () => {
    show(FIGURES);
    const legend = within(await screen.findByRole("list", { name: "Categories" }));
    const items = legend.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Software",
      "Contractors",
      "Travel",
      "Office",
      "Marketing",
      "Other",
    ]);
    expect(items[5].querySelector("[aria-hidden='true']")?.className).toContain("bg-bar-soft");
  });

  it("gives each month's totals by category for anyone who can't see the chart", async () => {
    show(FIGURES);
    const table = within(await screen.findByRole("table", { name: "Spending by category for the last 12 months" }));
    const [header, ...rows] = table.getAllByRole("row");
    expect(header.textContent).toBe("MonthSoftwareContractorsTravelOfficeMarketingOtherTotal");
    expect(rows).toHaveLength(12);
    expect(rows[2].textContent).toBe("Jan$1,736.00$0.00$0.00$0.00$0.00$8,359.00$10,095.00");
    expect(rows[11].textContent).toBe("Oct so far$1,797.00$9,037.50$0.00$4,500.00$0.00$0.00$15,334.50");
  });

  it("says so when there's been no spending in the 12 months", async () => {
    show({ ...FIGURES, months: year() });
    expect(await screen.findByText("Spending will show here once you've added bills.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Categories" })).toBeNull();
  });
});

describe("stacked columns", () => {
  const PLOT = 200;
  const pixels = (value: number, top: number) => (value * PLOT) / top;

  it("stack a value too small to see at the least height, and leave the rest as they are", () => {
    const { top, drawn } = stackScale([[450000, 4900], [100], [0]], PLOT);
    expect(top).toBe(500000);
    expect(pixels(drawn(4900), top)).toBeCloseTo(LEAST_HEIGHT);
    expect(pixels(drawn(100), top)).toBeCloseTo(LEAST_HEIGHT);
    expect(drawn(450000)).toBe(450000);
    expect(drawn(0)).toBe(0);
  });

  it("raise the top when the least heights carry a column past it", () => {
    // 1,000,000 is a round top already, so six small values on it need the next one.
    const column = [999994, 1, 1, 1, 1, 1, 1];
    const { top, drawn } = stackScale([column], PLOT);
    expect(top).toBe(2000000);
    expect(column.reduce((sum, value) => sum + drawn(value), 0)).toBeLessThanOrEqual(top);
    expect(pixels(drawn(1), top)).toBeCloseTo(LEAST_HEIGHT);
  });

  it("share half the chart among a column's small segments when the least height won't fit", () => {
    const column = [1000000, ...Array.from({ length: 99 }, () => 1)];
    const { top, drawn } = stackScale([column], PLOT);
    expect(column.reduce((sum, value) => sum + pixels(drawn(value), top), 0)).toBeLessThanOrEqual(PLOT);
    expect(pixels(drawn(1), top)).toBeCloseTo(PLOT / 2 / column.length);
  });

  it("never let the gap take more than half a segment", () => {
    const bar = { x: 0, y: 0, width: 6, height: 3 } as BarShapeProps;
    const { container } = render(
      <svg>
        <StackSegment bar={bar} fill="var(--color-coral)" onAnother onTop={false} />
      </svg>,
    );
    expect(heightOf(container.querySelector("path")!)).toBe(1.5);
  });
});
