// What the aged balances' tests share: the backend's replies for a today of Nov 5, 2026, and a
// stand-in for a bar's size, which jsdom can't lay out.
import { parseISO } from "date-fns";
import { vi } from "vitest";

import type { LatePart } from "../components/charts/lateness";
import type { AgedReply } from "./queries";

/** Midday, in the computer's own zone, so the day is the same wherever the tests run. */
export const TODAY = parseISO("2026-11-05T12:00");

/** A bar's box. */
export const WIDTH = 600;
export const HEIGHT = 14;

/** jsdom lays nothing out, so this reports every watched element at the bar's size. */
class SizedObserver implements ResizeObserver {
  constructor(private report: ResizeObserverCallback) {}
  observe(target: Element) {
    const contentRect = new DOMRectReadOnly(0, 0, WIDTH, HEIGHT);
    this.report([{ target, contentRect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], this);
  }
  unobserve() {}
  disconnect() {}
}

export function sizeTheBars() {
  vi.stubGlobal("ResizeObserver", SizedObserver);
}

export const KEYS: LatePart[] = ["not_due", "1_30", "31_60", "61_90", "over_90"];
const DAYS_PAST_DUE = [-10, 12, 45, 75, 120];
/** The first item's id in each row is its id times 10. */
const DUE_ON = ["2026-11-15", "2026-10-24", "2026-09-21", "2026-08-22", "2026-07-08"];

type Amounts = [number, number, number, number, number];
type RowReply = AgedReply["rows"][number];

/** An organization owing these amounts in each part, with one open item in every part that has some. */
export function row(id: number, name: string, amounts: Amounts, prefix = "INV"): RowReply {
  const items = amounts.flatMap((cents, place) =>
    cents === 0
      ? []
      : [
          {
            id: id * 10 + place,
            number: `${prefix}-${id}${place}`,
            due_on: DUE_ON[place],
            days_past_due: DAYS_PAST_DUE[place],
            part: KEYS[place],
            cents: String(cents),
          },
        ],
  );
  return {
    id,
    name,
    parts: KEYS.map((key, place) => ({ key, cents: String(amounts[place]), count: amounts[place] === 0 ? 0 : 1 })),
    total_cents: String(amounts.reduce((sum, cents) => sum + cents, 0)),
    oldest_days_past_due: Math.max(0, ...items.map((item) => item.days_past_due)),
    items,
  };
}

/** The reply for these rows, with the totals added up from them. */
export function agedReply(rows: RowReply[], on = "2026-11-05"): AgedReply {
  const parts = KEYS.map((key, place) => ({
    key,
    cents: String(rows.reduce((sum, one) => sum + Number(one.parts[place].cents), 0)),
    count: rows.reduce((sum, one) => sum + one.parts[place].count, 0),
  }));
  const total = rows.reduce((sum, one) => sum + Number(one.total_cents), 0);
  return { today: "2026-11-05", on, rows, totals: { parts, total_cents: String(total) } };
}

/** Bluebird Bakery owes the most, and Greyfriars Property has a part too small to see. */
export const CUSTOMER_ROWS = [
  row(1, "Bluebird Bakery", [0, 0, 0, 0, 500_000]),
  row(2, "Harbor & Pine", [100_000, 200_000, 0, 0, 0]),
  row(3, "Greyfriars Property", [0, 0, 150_000, 0, 1_000]),
];

export const SUPPLIER_ROWS = [
  row(7, "Northwind Software", [0, 0, 0, 0, 124_000], "NS"),
  row(8, "Wayfarer Travel", [48_000, 126_500, 0, 32_000, 0], "WT"),
];

export function customersReply(on?: string) {
  return agedReply(CUSTOMER_ROWS, on);
}

export function suppliersReply(on?: string) {
  return agedReply(SUPPLIER_ROWS, on);
}
