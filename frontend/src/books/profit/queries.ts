import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { Category } from "../../components/charts/categories";
import { api } from "../../lib/api";
import type { CentsSum } from "../../lib/money";
import { useToday } from "../../lib/useToday";

export type PeriodKind = "month" | "quarter" | "year";

/** How a figure changed from the period before: a whole percent, tenths of a point, "new" or nothing (X7). */
export type Change = { kind: "percent" | "points" | "new" | "none"; value: number | null };

export type CategoryAmount = { category: Category; name: string; cents: CentsSum };

/** A statement's figures as the backend adds them up from the books. Sums stay strings until shown (X1). */
export type Figures = {
  revenue_cents: CentsSum;
  /** Software, Contractors, Travel, Office, Marketing and Other, in that order. */
  categories: CategoryAmount[];
  expenses_cents: CentsSum;
  profit_cents: CentsSum;
  /** Tenths of a percent, or null with no revenue (X3). */
  margin_tenths: number | null;
};

export type ChartMonth = Figures & { month: string; label: string; year: number; first: string; last: string };

export type PeriodFigures = Figures & { kind: PeriodKind; label: string; first: string; last: string };

export type ShownPeriod = PeriodFigures & {
  current: boolean;
  /** The day the arrows go to, or null where they're off (X5). */
  back_on: string | null;
  forward_on: string | null;
  changes: {
    revenue: Change;
    categories: Change[];
    expenses: Change;
    profit: Change;
    margin: Change;
  };
};

export type ProfitAndLossReply = {
  today: string;
  /** The last 12 months, oldest first. */
  months: ChartMonth[];
  period: ShownPeriod;
  previous: PeriodFigures | null;
};

/**
 * The chart and the statement in one read (X16). Keyed by the period, the day and today, so a new
 * choice reads again while the old statement stays on screen, and the day changing reads it again.
 */
export function useProfitAndLoss(kind: PeriodKind, on: string | null) {
  const today = useToday();
  return useQuery({
    queryKey: ["profit-and-loss", kind, on, today],
    queryFn: () =>
      api<ProfitAndLossReply>(
        `/books/profit-and-loss?period=${kind}${on === null ? "" : `&on=${encodeURIComponent(on)}`}`,
      ),
    placeholderData: keepPreviousData,
  });
}

/** One of the statement's figures, or one expense account's key such as "expense_software". */
export type Figure = string;

export type EntryReply = {
  id: number;
  entry_date: string;
  kind: string;
  source_id: number;
  event: string;
  link: string;
  reverses_id: number | null;
  label: string | null;
  amount: CentsSum;
};

export type FigureEntriesReply = {
  figure: Figure;
  count: number;
  total: CentsSum;
  entries: EntryReply[];
};

export const PAGE_SIZE = 100;

/** The entries behind a figure, 100 at a time (X13). */
export function useFigureEntries(figure: Figure, from: string, to: string) {
  const today = useToday();
  return useInfiniteQuery({
    queryKey: ["profit-and-loss", "entries", figure, from, to, today],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<FigureEntriesReply>(
        `/books/profit-and-loss/entries?figure=${encodeURIComponent(figure)}&from=${from}&to=${to}&limit=${PAGE_SIZE}&offset=${pageParam}`,
      ),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((count, page) => count + page.entries.length, 0);
      return loaded < last.count ? loaded : undefined;
    },
  });
}

/** What a dialog lists: the entries behind one figure over a range, such as a month or the period shown (X13). */
export type Target = {
  figure: Figure;
  /** "Revenue" or "Software", for the title. */
  name: string;
  /** "March 2026", for the title. */
  periodLabel: string;
  from: string;
  to: string;
};
