import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import type { CentsSum } from "../lib/money";

export type BalancesReply = {
  on: string;
  accounts: { key: string; name: string; type: string; balance_cents: CentsSum }[];
};

export type EntryReply = {
  id: number;
  entry_date: string;
  kind: string;
  source_id: number;
  event: string;
  link: string;
  reverses_id: number | null;
  reversed_by_id: number | null;
  created_by: { id: string; name: string } | null;
  created_at: string;
  lines: { account: string; debit_cents: number; credit_cents: number }[];
};

export type EntriesReply = { total: number; entries: EntryReply[] };

/** How many entries the dialog reads at a time (X14). */
export const PAGE = 100;

/** A day's figures are read again after a save, and otherwise when a minute has passed, so moving the slider back to a day read earlier reads nothing. */
const FRESH_MS = 60_000;

/** Every read sits under ["books"], so the invalidation after any save reaches them all. */
export function balancesQuery(day: string) {
  return {
    queryKey: ["books", "balances", day],
    queryFn: () => api<BalancesReply>(`/books/balances?on=${day}`),
    staleTime: FRESH_MS,
  };
}

/** A day's balances, keeping the day before's on screen while this one is on its way (X10). */
export function useBalances(day: string) {
  return useQuery({ ...balancesQuery(day), placeholderData: keepPreviousData });
}

/** The entries with a line in any of the accounts, dated up to the day, newest first, 100 at a time (X11, X14). */
export function useEntries(accounts: readonly string[], day: string) {
  return useInfiniteQuery({
    queryKey: ["books", "entries", accounts, day],
    queryFn: ({ pageParam }) => {
      const wanted = accounts.map((key) => `account=${encodeURIComponent(key)}`).join("&");
      return api<EntriesReply>(`/books/entries?${wanted}&to=${day}&limit=${PAGE}&offset=${pageParam}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const read = all.reduce((sum, page) => sum + page.entries.length, 0);
      return read < last.total && last.entries.length > 0 ? read : undefined;
    },
  });
}
