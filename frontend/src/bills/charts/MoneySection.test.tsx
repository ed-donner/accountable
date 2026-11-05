import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user, type Call } from "../../test-utils";
import type { Category, DueBill, MoneyFigures, SpendingMonth } from "../queries";
import { dueDays } from "./DueTimeline";
import { MoneySection } from "./MoneySection";

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

function year(spent: Partial<Record<string, Partial<Record<Category, number>>>> = {}): SpendingMonth[] {
  return LABELS.map((label, index) => {
    const month = `${index < 2 ? 2025 : 2026}-${String(((index + 10) % 12) + 1).padStart(2, "0")}`;
    const categories = { ...NOTHING, ...spent[label] };
    const total = Object.values(categories).reduce((sum, cents) => sum + cents, 0);
    return { month, label, total_cents: total, categories };
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
  owed: { total_cents: 2633710, count: 10 },
  overdue: { total_cents: 712993, count: 3 },
  due: { total_cents: 1541015, count: 4, bills: DUE },
  months: year({
    Jan: { software: 173600, other: 835900 },
    Oct: { software: 179700, contractors: 903750, office: 450000 },
  }),
};

const EMPTY: MoneyFigures = {
  today: "2026-10-31",
  owed: { total_cents: 0, count: 0 },
  overdue: { total_cents: 0, count: 0 },
  due: { total_cents: 0, count: 0, bills: [] },
  months: year(),
};

function show(figures: MoneyFigures | (() => { status?: number; body: unknown })) {
  const calls = mockApi({ "GET /bills/dashboard": figures });
  renderApp(<MoneySection />);
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

function leftEdge(segment: SVGPathElement) {
  return Number(/^M\s*([\d.]+)/.exec(segment.getAttribute("d") ?? "")?.[1]);
}

describe("the Money section", () => {
  it("comes under its own heading, with the bills to pay and the spending side by side", async () => {
    show(FIGURES);
    expect(await screen.findByRole("heading", { level: 2, name: "Money" })).toBeTruthy();
    await screen.findByRole("region", { name: "Bills to pay" });
    expect(panel("Bills to pay").getByRole("heading", { name: "Bills to pay" })).toBeTruthy();
    expect(panel("Spending by category").getByRole("heading", { name: "Spending by category" })).toBeTruthy();
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
    return panel("Bills to pay").getByRole("img", { name: /due from today/ });
  }

  it("gives the total due and how many, over a timeline from today", async () => {
    show(FIGURES);
    expect((await screen.findByTestId("due-total")).textContent).toBe("$15,410.15");
    expect(panel("Bills to pay").getByText("4 bills")).toBeTruthy();
    expect(timeline().getAttribute("aria-label")).toBe("4 bills due from today to Nov 30, 2026, each at its due date");
    const axis = within(timeline());
    for (const label of ["Today", "Nov 7", "Nov 14", "Nov 21", "Nov 28"]) expect(axis.getByText(label)).toBeTruthy();
  });

  it("draws each bill in its category's color, with bills due on one day stacked", async () => {
    show(FIGURES);
    await screen.findByTestId("due-total");
    const drawn = segments(timeline());
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
    await screen.findByTestId("due-total");
    fireEvent.mouseEnter(segments(timeline())[3]);
    await screen.findByText("Wayfarer Travel WT77133");
    const tip = timeline().querySelector<HTMLElement>(".recharts-tooltip-wrapper")!;
    expect(tip.textContent).toBe("$522.60Wayfarer Travel WT77133Travel");
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
    show({ ...FIGURES, due: { total_cents: 0, count: 0, bills: [] } });
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

  it("has a column for each of the last 12 months, with this month's total so far above it", async () => {
    show(FIGURES);
    await screen.findByRole("link", { name: /^What we owe/ });
    expect(chart().getAttribute("aria-label")).toBe(
      "Spending by category for the last 12 months, with $15,334.50 so far this month",
    );
    const drawn = within(chart());
    for (const label of LABELS) expect(drawn.getByText(label)).toBeTruthy();
    expect(drawn.getByText("so far")).toBeTruthy();
    expect(drawn.getByText("$15,334.50")).toBeTruthy();
  });

  it("stacks each month's categories in their order, from Software at the bottom", async () => {
    show(FIGURES);
    await screen.findByRole("link", { name: /^What we owe/ });
    expect(segments(chart()).map((segment) => segment.getAttribute("fill"))).toEqual([
      "var(--color-sea-green)",
      "var(--color-sea-green)",
      "var(--color-marigold)",
      "var(--color-cerulean)",
      "var(--color-bar-soft)",
    ]);
  });

  it("shows each category's total and the month's for the month pointed at", async () => {
    show(FIGURES);
    await screen.findByRole("link", { name: /^What we owe/ });
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
