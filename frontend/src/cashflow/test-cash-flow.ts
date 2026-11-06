// What the cash flow's tests share: the backend's replies for a today of Nov 5, 2026, so the
// chart runs from Dec 2025 to Feb 2027, and a stand-in for the chart's size, which jsdom can't lay out.
import { parseISO } from "date-fns";
import { vi } from "vitest";

import type { CashFlowReply, ExpectedReply, ItemReply, MonthReply } from "./queries";

/** Midday, in the computer's own zone, so the day is the same wherever the tests run. */
export const TODAY = parseISO("2026-11-05T12:00");

/** The chart's box: 1,200px of plot, 80px a month, and 56px for the money axis. */
export const WIDTH = 1256;
export const HEIGHT = 240;
export const COLUMN = 80;

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

const LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Dec 2025 to Nov 2026, then Dec 2026, Jan 2027 and Feb 2027. */
export const KEYS = Array.from({ length: 15 }, (_, index) => {
  const counted = 2025 * 12 + 11 + index;
  return `${Math.floor(counted / 12)}-${String((counted % 12) + 1).padStart(2, "0")}`;
});

function figures(index: number) {
  if (index < 11) return { moved: [300_000 + index * 10_000, 120_000], expected: [0, 0], likely: 0 };
  if (index === 11) return { moved: [150_000, 20_000], expected: [250_000, 60_000], likely: 100_000 };
  return { moved: [0, 0], expected: [200_000, 80_000], likely: 300_000 };
}

/** The months with money in and out in each, an opening balance of $40,000.00 on Dec 1, 2025, and likely deals from this month. */
function months(): MonthReply[] {
  let balance = 4_000_000;
  let likely = 0;
  return KEYS.map((month, index) => {
    const { moved, expected, likely: deals } = figures(index);
    balance += moved[0] - moved[1] + expected[0] - expected[1];
    likely += deals;
    return {
      month,
      label: LABELS[Number(month.slice(5)) - 1],
      year: Number(month.slice(0, 4)),
      kind: index < 11 ? "past" : index === 11 ? "current" : "forecast",
      in_cents: String(moved[0]),
      in_count: moved[0] ? 3 : 0,
      out_cents: String(moved[1]),
      out_count: moved[1] ? 2 : 0,
      expected_in_cents: String(expected[0]),
      expected_in_count: expected[0] ? 4 : 0,
      expected_out_cents: String(expected[1]),
      expected_out_count: expected[1] ? 1 : 0,
      likely_cents: String(deals),
      likely_count: deals ? 2 : 0,
      balance_cents: String(balance),
      balance_with_deals_cents: String(balance + likely),
    };
  });
}

type Changes = { opening?: boolean; months?: Record<string, Partial<MonthReply>> } & Partial<
  Omit<CashFlowReply, "months" | "opening">
>;

/** The cash flow, with these changes, and with no balances or figures at all without an opening balance. */
export function cashFlowReply({ opening = true, months: changed = {}, ...figures }: Changes = {}): CashFlowReply {
  const shown = months().map((month) => ({
    ...month,
    ...(opening ? {} : { balance_cents: null, balance_with_deals_cents: null }),
    ...changed[month.month],
  }));
  const last = shown[shown.length - 1];
  return {
    today: "2026-11-05",
    opening: opening ? { balance_cents: "4000000", on: "2025-12-01" } : null,
    cash_today: opening ? "6660000" : null,
    forecast_end: opening ? last.balance_cents : null,
    forecast_end_with_deals: opening ? last.balance_with_deals_cents : null,
    months: shown,
    ...figures,
  };
}

/** Nothing has moved in any month and nothing is expected. */
export function quietMonths(): Record<string, Partial<MonthReply>> {
  const quiet = {
    in_cents: "0",
    in_count: 0,
    out_cents: "0",
    out_count: 0,
    expected_in_cents: "0",
    expected_in_count: 0,
    expected_out_cents: "0",
    expected_out_count: 0,
  };
  return Object.fromEntries(KEYS.map((key) => [key, quiet]));
}

export function item(id: number, name: string, changes: Partial<ItemReply> = {}): ItemReply {
  return {
    id,
    name,
    organization: "Harbor & Pine",
    due_on: "2026-12-10",
    expected_on: "2026-12-10",
    cents: "100000",
    days_paid_late: null,
    ...changes,
  };
}

/** A month's list, each group's total the sum of its items. */
export function expectedReply(
  month: string,
  groups: Partial<Record<"in" | "out" | "likely", ItemReply[]>> = {},
): ExpectedReply {
  const group = (items: ItemReply[] = []) => ({
    total_cents: String(items.reduce((sum, each) => sum + BigInt(each.cents), 0n)),
    items,
  });
  return { month, coming_in: group(groups.in), going_out: group(groups.out), likely_deals: group(groups.likely) };
}
