import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { LatePart } from "../components/charts/lateness";
import { api } from "../lib/api";
import type { CentsSum } from "../lib/money";
import { useToday } from "../lib/useToday";

export type View = "customers" | "suppliers";

type PartReply = { key: LatePart; cents: CentsSum; count: number };

export type AgedReply = {
  today: string;
  on: string;
  rows: {
    id: number;
    name: string;
    parts: PartReply[];
    total_cents: CentsSum;
    oldest_days_past_due: number;
    items: { id: number; number: string; due_on: string; days_past_due: number; part: LatePart; cents: CentsSum }[];
  }[];
  totals: { parts: PartReply[]; total_cents: CentsSum };
};

/** What's owed in one part, with how many invoices or bills that is. The sums are exact. */
export type PartSum = { key: LatePart; cents: bigint; count: number };

/** An open invoice or bill, with what's still owed on it on the day shown. */
export type AgedItem = {
  id: number;
  number: string;
  dueOn: string;
  /** 0 or less when it's not yet due. */
  daysPastDue: number;
  part: LatePart;
  cents: bigint;
};

export type AgedRow = { id: number; name: string; parts: PartSum[]; total: bigint; items: AgedItem[] };

/** One view as the backend works it out (X1 to X10). The page adds nothing up. */
export type Aged = { today: string; on: string; rows: AgedRow[]; totals: { parts: PartSum[]; total: bigint } };

function readParts(parts: PartReply[]): PartSum[] {
  return parts.map((part) => ({ key: part.key, cents: BigInt(part.cents), count: part.count }));
}

export function readAged(reply: AgedReply): Aged {
  return {
    today: reply.today,
    on: reply.on,
    rows: reply.rows.map((row) => ({
      id: row.id,
      name: row.name,
      parts: readParts(row.parts),
      total: BigInt(row.total_cents),
      items: row.items.map((item) => ({
        id: item.id,
        number: item.number,
        dueOn: item.due_on,
        daysPastDue: item.days_past_due,
        part: item.part,
        cents: BigInt(item.cents),
      })),
    })),
    totals: { parts: readParts(reply.totals.parts), total: BigInt(reply.totals.total_cents) },
  };
}

/**
 * One view on a day, keyed by both. Today, which isn't kept in the address, also follows the date,
 * so it's read again when the day changes (X9), and a day that was chosen stays as it is. The table
 * from the day before stays on screen until the next arrives.
 */
export function useAged(view: View, on: string | null) {
  const today = useToday();
  return useQuery({
    queryKey: ["aged-balances", view, on ?? { today }],
    queryFn: () => api<AgedReply>(`/aged-balances/${view}${on ? `?on=${on}` : ""}`),
    select: readAged,
    placeholderData: keepPreviousData,
  });
}
