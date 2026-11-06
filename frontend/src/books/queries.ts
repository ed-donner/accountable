import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import type { CentsSum } from "../lib/money";
import type { Person } from "../lib/records";
import { useToday } from "../lib/useToday";

/** Entries and ledger lines are read this many at a time (J20). */
export const PAGE = 100;

/** The chart of accounts, fixed in the backend (J1), in the order the Journal's filter lists it. */
export const ACCOUNTS = [
  { key: "cash", name: "Cash", type: "Asset" },
  { key: "receivable", name: "Receivable", type: "Asset" },
  { key: "payable", name: "Payable", type: "Liability" },
  { key: "tax_payable", name: "Tax payable", type: "Liability" },
  { key: "owners_equity", name: "Owner's equity", type: "Equity" },
  { key: "revenue", name: "Revenue", type: "Revenue" },
  { key: "expense_software", name: "Software", type: "Expense" },
  { key: "expense_contractors", name: "Contractors", type: "Expense" },
  { key: "expense_travel", name: "Travel", type: "Expense" },
  { key: "expense_office", name: "Office", type: "Expense" },
  { key: "expense_marketing", name: "Marketing", type: "Expense" },
  { key: "expense_other", name: "Other", type: "Expense" },
] as const;

export function findAccount(key: string) {
  return ACCOUNTS.find((account) => account.key === key);
}

/** An account's name from its key, or the key itself if the chart ever grows ahead of this page. */
export function accountName(key: string): string {
  return findAccount(key)?.name ?? key;
}

export type EntryLine = { account: string; debit_cents: number; credit_cents: number };

export type Entry = {
  id: number;
  entry_date: string;
  kind: string;
  source_id: number;
  event: string;
  /** The page that opens the record the entry came from. */
  link: string;
  description: string;
  document: string | null;
  reverses_id: number | null;
  reversed_by_id: number | null;
  created_by: Person | null;
  created_at: string;
  lines: EntryLine[];
};

export type EntriesReply = { total: number; entries: Entry[] };

/** What the Journal's toolbar sets. A blank is not set. */
export type EntryFilters = { q: string; account: string; from: string; to: string };
export const NO_FILTERS: EntryFilters = { q: "", account: "", from: "", to: "" };

export function anyFilter(filters: EntryFilters): boolean {
  return Object.values(filters).some((value) => value !== "");
}

function filterQuery(filters: EntryFilters): URLSearchParams {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.account) query.set("account", filters.account);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  return query;
}

/** The next page's offset, or nothing once every one is read. */
function nextOffset<T extends { total: number }>(_last: T, pages: T[], read: (page: T) => number) {
  const loaded = pages.reduce((count, page) => count + read(page), 0);
  return loaded < pages[0].total ? loaded : undefined;
}

/**
 * The Journal, a page at a time, newest first. Keyed by the filters and the day, so a changed filter
 * starts again from the top, and a reply to an older search never lands on a newer one (J17, J20).
 */
export function useEntries(filters: EntryFilters) {
  const today = useToday();
  return useInfiniteQuery({
    queryKey: ["books", "entries", today, filters],
    queryFn: ({ pageParam }) => {
      const query = filterQuery(filters);
      query.set("limit", String(PAGE));
      query.set("offset", String(pageParam));
      return api<EntriesReply>(`/books/entries?${query}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last, pages) => nextOffset(last, pages, (page) => page.entries.length),
    placeholderData: keepPreviousData,
  });
}

/** How many entries there are in all, for "12 of 230 entries". */
export function useEntryCount() {
  const today = useToday();
  return useQuery({
    queryKey: ["books", "entry-count", today],
    queryFn: () => api<EntriesReply>("/books/entries?limit=1"),
    select: (reply) => reply.total,
  });
}

/** A record's kind in the books, for its Accounting panel: a bill's includes its paid entries (J19). */
export type RecordKind = "invoice" | "payment" | "bill";

/** The entries a record made, oldest first. `enabled` holds a payment's read back until its panel is opened. */
export function useRecordEntries(kind: RecordKind, id: number, enabled = true) {
  const today = useToday();
  return useQuery({
    queryKey: ["books", "record", kind, id, today],
    queryFn: () => api<EntriesReply>(`/books/entries?kind=${kind}&source_id=${id}&limit=500`),
    select: (reply) => reply.entries,
    enabled,
  });
}

export type LedgerLineReply = {
  id: number;
  entry_id: number;
  entry_date: string;
  kind: string;
  event: string;
  description: string;
  document: string | null;
  link: string;
  is_reversal: boolean;
  is_reversed: boolean;
  debit_cents: number;
  credit_cents: number;
  balance_cents: CentsSum;
};

export type LedgerReply = {
  key: string;
  name: string;
  type: string;
  balance_cents: CentsSum;
  total: number;
  last_entry_date: string | null;
  lines: LedgerLineReply[];
};

/** An account's lines, newest first, a page at a time, each with the balance after it (J18). */
export function useLedger(key: string) {
  const today = useToday();
  return useInfiniteQuery({
    queryKey: ["books", "ledger", today, key],
    queryFn: ({ pageParam }) => api<LedgerReply>(`/books/accounts/${key}/ledger?limit=${PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => nextOffset(last, pages, (page) => page.lines.length),
  });
}

type MonthsReply = {
  months: {
    month: string;
    label: string;
    year: number;
    accounts: { key: string; balance_cents: CentsSum }[];
  }[];
};

/** One account's balance at the end of a month. The sum is read as a BigInt, as it can pass what a number holds. */
export type AccountMonth = { month: string; label: string; balance: bigint };

/** An account's balance at the end of each of the last 12 months, oldest first (J12, J18). */
export function useAccountMonths(key: string) {
  const today = useToday();
  return useQuery({
    queryKey: ["books", "months", today],
    queryFn: () => api<MonthsReply>("/books/months"),
    select: (reply): AccountMonth[] =>
      reply.months.map((month) => ({
        month: month.month,
        label: month.label,
        balance: BigInt(month.accounts.find((account) => account.key === key)?.balance_cents ?? "0"),
      })),
  });
}
