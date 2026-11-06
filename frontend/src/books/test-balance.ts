// What the balance sheet's tests share: the backend's replies for a today of Nov 5, 2026, and the chart's size, as
// cashflow/test-cash-flow.ts does for the cash flow.
import { parseISO } from "date-fns";
import { vi } from "vitest";

import type { BalancesReply, EntriesReply, EntryReply } from "./queries";

/** Midday, in the computer's own zone, so the day is the same wherever the tests run. */
export const TODAY = parseISO("2026-11-05T12:00");

/** The chart's box: wide enough for two 120px bars, 220px tall plus its axis and names. */
export const WIDTH = 640;
export const HEIGHT = 280;

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

const NAMES: Record<string, string> = {
  cash: "Cash",
  receivable: "Receivable",
  payable: "Payable",
  tax_payable: "Tax payable",
  owners_equity: "Owner's equity",
  revenue: "Revenue",
  expense_software: "Software",
  expense_contractors: "Contractors",
  expense_travel: "Travel",
  expense_office: "Office",
  expense_marketing: "Marketing",
  expense_other: "Other",
};

const TYPES: Record<string, string> = {
  cash: "asset",
  receivable: "asset",
  payable: "liability",
  tax_payable: "liability",
  owners_equity: "equity",
  revenue: "revenue",
};

/**
 * A day's balances. Cash $62,300.00, Receivable $27,100.00, Payable $9,100.00, Tax payable $1,800.00 and
 * Owner's equity $40,000.00, so Revenue $50,000.00 less $11,500.00 of expenses makes $38,500.00 of profit, and
 * each side comes to $89,400.00. `changes` sets any account's cents.
 */
export function balancesReply(on: string, changes: Record<string, string> = {}): BalancesReply {
  const cents: Record<string, string> = {
    cash: "6230000",
    receivable: "2710000",
    payable: "910000",
    tax_payable: "180000",
    owners_equity: "4000000",
    revenue: "5000000",
    expense_software: "300000",
    expense_contractors: "400000",
    expense_travel: "150000",
    expense_office: "200000",
    expense_marketing: "50000",
    expense_other: "50000",
    ...changes,
  };
  return {
    on,
    accounts: Object.keys(NAMES).map((key) => ({
      key,
      name: NAMES[key],
      type: TYPES[key] ?? "expense",
      balance_cents: cents[key],
    })),
  };
}

/** Nothing in the books yet. */
export function emptyBalances(on: string): BalancesReply {
  const zero = Object.fromEntries(Object.keys(NAMES).map((key) => [key, "0"]));
  return balancesReply(on, zero);
}

/** One entry of a bill, added and paid, or an invoice, as the route gives it. */
export function entry(id: number, changes: Partial<EntryReply> = {}): EntryReply {
  return {
    id,
    entry_date: "2026-10-20",
    kind: "invoice",
    source_id: id,
    event: "invoice_issued",
    link: `/invoices/${id}`,
    reverses_id: null,
    reversed_by_id: null,
    created_by: { id: "teammate-alex", name: "Alex Rivera" },
    created_at: "2026-10-20T10:00:00Z",
    lines: [
      { account: "receivable", debit_cents: 10000, credit_cents: 0 },
      { account: "revenue", debit_cents: 0, credit_cents: 10000 },
    ],
    ...changes,
  };
}

export function entriesReply(entries: EntryReply[], total = entries.length): EntriesReply {
  return { total, entries };
}
