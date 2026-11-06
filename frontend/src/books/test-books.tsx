// What the books' tests share: the backend's replies in small, and a way to draw a page at an address.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { vi } from "vitest";

import { queryDefaults } from "../lib/queryDefaults";
import {
  PAGE,
  type AccountMonth,
  type EntriesReply,
  type Entry,
  type EntryFilters,
  type LedgerLineReply,
  type LedgerReply,
} from "./queries";

/** An issued invoice's entry: Receivable debited with the total, Revenue and Tax payable credited. */
export function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: 1,
    entry_date: "2026-10-30",
    kind: "invoice",
    source_id: 7,
    event: "invoice_issued",
    link: "/invoices/7",
    description: "Invoice INV-0007 issued",
    document: "INV-0007",
    reverses_id: null,
    reversed_by_id: null,
    created_by: { id: "dana", name: "Dana Whitfield" },
    created_at: "2026-10-30T15:00:00",
    lines: [
      { account: "receivable", debit_cents: 108875, credit_cents: 0 },
      { account: "revenue", debit_cents: 0, credit_cents: 100000 },
      { account: "tax_payable", debit_cents: 0, credit_cents: 8875 },
    ],
    ...over,
  };
}

/** `count` entries, newest first, numbered down from `from`. */
export function manyEntries(count: number, from = count): Entry[] {
  return Array.from({ length: count }, (_unused, place) =>
    entry({ id: from - place, description: `Entry ${from - place}`, document: `DOC-${from - place}` }),
  );
}

export function entriesReply(entries: Entry[], total = entries.length): EntriesReply {
  return { total, entries };
}

export const NO_FILTERS_SET: EntryFilters = { q: "", account: "", from: "", to: "" };

/** The path the Journal asks for, which tests key their stand-in replies by. */
export function entriesPath(filters: Partial<EntryFilters> = {}, offset = 0): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) if (value) query.set(name, value);
  query.set("limit", String(PAGE));
  query.set("offset", String(offset));
  return `/books/entries?${query}`;
}

export const COUNT_PATH = "GET /books/entries?limit=1";

export function ledgerLine(over: Partial<LedgerLineReply> = {}): LedgerLineReply {
  return {
    id: 1,
    entry_id: 1,
    entry_date: "2026-10-30",
    kind: "payment",
    event: "payment_recorded",
    description: "Payment received on INV-0007",
    document: "INV-0007",
    link: "/invoices/7",
    is_reversal: false,
    is_reversed: false,
    debit_cents: 50000,
    credit_cents: 0,
    balance_cents: "1005000",
    ...over,
  };
}

export function ledgerReply(over: Partial<LedgerReply> = {}): LedgerReply {
  const lines = over.lines ?? [ledgerLine()];
  return {
    key: "cash",
    name: "Cash",
    type: "asset",
    balance_cents: lines[0]?.balance_cents ?? "0",
    total: lines.length,
    last_entry_date: lines.length ? lines[0].entry_date : null,
    lines,
    ...over,
  };
}

/** Twelve months ending in October 2026, each with the balance given or 0. */
export function months(balances: (bigint | number)[] = []): AccountMonth[] {
  const labels = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  return labels.map((label, place) => ({
    month: `m${place}`,
    label,
    balance: BigInt(balances[place] ?? 0),
  }));
}

/** The /books/months reply for one account. */
export function monthsReply(key: string, balances: string[]) {
  return {
    months: balances.map((balance, place) => ({
      month: `2026-${String(place + 1).padStart(2, "0")}`,
      label: `M${place + 1}`,
      year: 2026,
      accounts: [{ key, balance_cents: balance }],
    })),
  };
}

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

/** A page at an address, with the address shown, so a test can see what the page wrote to it. */
export function renderAt(address: string, path: string, page: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: queryDefaults });
  const router = createMemoryRouter(
    [
      {
        path,
        element: (
          <>
            {page}
            <Where />
          </>
        ),
      },
      { path: "*", element: <Where /> },
    ],
    { initialEntries: [address] },
  );
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

/** A stand-in for the browser's IntersectionObserver, which jsdom leaves out: tests call `see` to scroll. */
export class FakeObserver {
  static all: FakeObserver[] = [];
  constructor(private report: IntersectionObserverCallback) {
    FakeObserver.all.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    FakeObserver.all = FakeObserver.all.filter((other) => other !== this);
  }
  takeRecords() {
    return [];
  }
  static see() {
    for (const observer of [...FakeObserver.all]) {
      observer.report(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    }
  }
}

export function stubObserver() {
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
}
