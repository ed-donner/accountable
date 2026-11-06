// What the Profit and loss tests share: the backend's replies for a today of Nov 5, 2026, so the
// chart runs from Dec 2025 to Nov 2026, and a stand-in for the chart's size, which jsdom can't lay out.
import { endOfMonth, format, parseISO } from "date-fns";
import { vi } from "vitest";

import type { Category } from "../../components/charts/categories";
import type {
  CategoryAmount,
  Change,
  ChartMonth,
  EntryReply,
  Figures,
  FigureEntriesReply,
  PeriodFigures,
  ProfitAndLossReply,
  ShownPeriod,
} from "./queries";

/** Midday, in the computer's own zone, so the day is the same wherever the tests run. */
export const TODAY = parseISO("2026-11-05T12:00");

/** The chart's box: 1,200px of plot, 100px a month, and 52px for the money axis. */
export const WIDTH = 1252;
export const HEIGHT = 300;

/** jsdom lays nothing out, so this reports every watched element at the chart's size. */
class SizedObserver implements ResizeObserver {
  constructor(private report: ResizeObserverCallback) {}
  observe(target: Element) {
    const contentRect = new DOMRectReadOnly(0, 0, WIDTH, HEIGHT);
    this.report([{ target, contentRect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], this);
  }
  unobserve() {}
  disconnect() {}
}

export function sizeTheChart() {
  vi.stubGlobal("ResizeObserver", SizedObserver);
}

const CATEGORY_NAMES: [Category, string][] = [
  ["software", "Software"],
  ["contractors", "Contractors"],
  ["travel", "Travel"],
  ["office", "Office"],
  ["marketing", "Marketing"],
  ["other", "Other"],
];

export const CHANGE_NONE: Change = { kind: "none", value: null };

/** Figures from a revenue and each category's cents, with the profit and margin worked out here, as the backend does. */
export function figuresOf(revenue: number, spent: Partial<Record<Category, number>> = {}): Figures {
  const categories: CategoryAmount[] = CATEGORY_NAMES.map(([category, name]) => ({
    category,
    name,
    cents: String(spent[category] ?? 0),
  }));
  const expenses = categories.reduce((sum, each) => sum + Number(each.cents), 0);
  const profit = revenue - expenses;
  return {
    revenue_cents: String(revenue),
    categories,
    expenses_cents: String(expenses),
    profit_cents: String(profit),
    margin_tenths: revenue > 0 ? Math.round((profit * 1000) / revenue) : null,
  };
}

const LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Dec 2025 to Nov 2026. */
export const KEYS = Array.from({ length: 12 }, (_, index) => {
  const counted = 2025 * 12 + 11 + index;
  return `${Math.floor(counted / 12)}-${String((counted % 12) + 1).padStart(2, "0")}`;
});

function monthName(key: string) {
  return LABELS[Number(key.slice(5)) - 1];
}

function lastDay(key: string) {
  return format(endOfMonth(parseISO(`${key}-01`)), "yyyy-MM-dd");
}

/** Revenue $4,000.00 + $500.00 a month, expenses $1,200.00 of software and $300.00 of travel (and $49.00 of office in Oct). */
export function chartMonths(changes: Record<string, Figures> = {}): ChartMonth[] {
  return KEYS.map((key, index) => ({
    month: key,
    label: monthName(key),
    year: Number(key.slice(0, 4)),
    first: `${key}-01`,
    last: lastDay(key),
    ...(changes[key] ??
      figuresOf(400_000 + index * 50_000, {
        software: 120_000,
        travel: 30_000,
        ...(key === "2026-10" ? { office: 4_900 } : {}),
      })),
  }));
}

const NOV = "2026-11";

/** A month's figures without its month, label and days, which a period has of its own. */
function justFigures(month: Figures): Figures {
  return {
    revenue_cents: month.revenue_cents,
    categories: month.categories,
    expenses_cents: month.expenses_cents,
    profit_cents: month.profit_cents,
    margin_tenths: month.margin_tenths,
  };
}

/** November 2026 so far, against October's: the period the page opens on. */
export function pageReply(
  changes: Partial<Omit<ProfitAndLossReply, "period">> & { period?: Partial<ShownPeriod> } = {},
) {
  const { period, ...rest } = changes;
  const months = rest.months ?? chartMonths();
  const now = months[months.length - 1];
  const before = months[months.length - 2];
  const shown: ShownPeriod = {
    kind: "month",
    label: "November 2026",
    first: `${NOV}-01`,
    last: `${NOV}-30`,
    ...justFigures(now),
    current: true,
    back_on: "2026-10-01",
    forward_on: null,
    changes: {
      revenue: { kind: "percent", value: 12 },
      categories: [
        { kind: "percent", value: -8 },
        CHANGE_NONE,
        { kind: "percent", value: 0 },
        { kind: "new", value: null },
        CHANGE_NONE,
        CHANGE_NONE,
      ],
      expenses: { kind: "percent", value: 4 },
      profit: { kind: "percent", value: 19 },
      margin: { kind: "points", value: 21 },
    },
    ...period,
  };
  const previous: PeriodFigures = {
    kind: "month",
    label: "October 2026",
    first: "2026-10-01",
    last: "2026-10-31",
    ...justFigures(before),
  };
  const reply: ProfitAndLossReply = { today: "2026-11-05", months, period: shown, previous, ...rest };
  return reply;
}

export function entry(id: number, changes: Partial<EntryReply> = {}): EntryReply {
  return {
    id,
    entry_date: "2026-11-02",
    kind: "invoice",
    source_id: id,
    event: "invoice_issued",
    link: `/invoices/${id}`,
    reverses_id: null,
    label: `INV-00${id}`,
    amount: "100000",
    ...changes,
  };
}

/** A list of entries behind a figure, its total the sum of their amounts unless told otherwise. */
export function entriesReply(
  figure: string,
  entries: EntryReply[],
  more: Partial<FigureEntriesReply> = {},
): FigureEntriesReply {
  const total = entries.reduce((sum, each) => sum + BigInt(each.amount), 0n);
  return { figure, count: entries.length, total: String(total), entries, ...more };
}
