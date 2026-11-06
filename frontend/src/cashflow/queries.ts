import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import { useToday } from "../lib/useToday";

/**
 * A sum or a balance in whole cents, as the backend sends it: digits, with a minus sign in
 * front below zero, such as "-425000". It can pass the 2^53 cents a JavaScript number holds
 * exactly, so it's read as a BigInt (Y20).
 */
type Digits = string;

export type MonthKind = "past" | "current" | "forecast";

export type MonthReply = {
  month: string;
  label: string;
  year: number;
  kind: MonthKind;
  in_cents: Digits;
  in_count: number;
  out_cents: Digits;
  out_count: number;
  expected_in_cents: Digits;
  expected_in_count: number;
  expected_out_cents: Digits;
  expected_out_count: number;
  likely_cents: Digits;
  likely_count: number;
  balance_cents: Digits | null;
  balance_with_deals_cents: Digits | null;
};

export type CashFlowReply = {
  today: string;
  opening: { balance_cents: Digits; on: string } | null;
  cash_today: Digits | null;
  forecast_end: Digits | null;
  forecast_end_with_deals: Digits | null;
  months: MonthReply[];
};

/** One of the 15 months, with its sums read as BigInts. */
export type CashMonth = {
  month: string;
  label: string;
  year: number;
  kind: MonthKind;
  in: bigint;
  inCount: number;
  out: bigint;
  outCount: number;
  expectedIn: bigint;
  expectedInCount: number;
  expectedOut: bigint;
  expectedOutCount: number;
  likely: bigint;
  likelyCount: number;
  /** At the month's end, or null before the opening balance's month or with none (Y9, Y10). */
  balance: bigint | null;
  balanceWithDeals: bigint | null;
};

/** The cash flow as the backend works it out for its today (Y1 to Y22). The page adds nothing up. */
export type CashFlow = {
  today: string;
  opening: { balance: bigint; on: string } | null;
  cashToday: bigint | null;
  forecastEnd: bigint | null;
  forecastEndWithDeals: bigint | null;
  /** The last 12 months, oldest first, then the 3 after this one. */
  months: CashMonth[];
};

function exact(digits: Digits): bigint;
function exact(digits: Digits | null): bigint | null;
function exact(digits: Digits | null) {
  return digits === null ? null : BigInt(digits);
}

function readMonth(month: MonthReply): CashMonth {
  return {
    month: month.month,
    label: month.label,
    year: month.year,
    kind: month.kind,
    in: exact(month.in_cents),
    inCount: month.in_count,
    out: exact(month.out_cents),
    outCount: month.out_count,
    expectedIn: exact(month.expected_in_cents),
    expectedInCount: month.expected_in_count,
    expectedOut: exact(month.expected_out_cents),
    expectedOutCount: month.expected_out_count,
    likely: exact(month.likely_cents),
    likelyCount: month.likely_count,
    balance: exact(month.balance_cents),
    balanceWithDeals: exact(month.balance_with_deals_cents),
  };
}

function readCashFlow(reply: CashFlowReply): CashFlow {
  return {
    today: reply.today,
    opening: reply.opening && { balance: exact(reply.opening.balance_cents), on: reply.opening.on },
    cashToday: exact(reply.cash_today),
    forecastEnd: exact(reply.forecast_end),
    forecastEndWithDeals: exact(reply.forecast_end_with_deals),
    months: reply.months.map(readMonth),
  };
}

/**
 * Keyed by the day, so it's read again when the day changes (Y19), keeping the chart
 * from the day before on screen until the new one arrives.
 */
export function useCashFlow() {
  const today = useToday();
  return useQuery({
    queryKey: ["cash-flow", today],
    queryFn: () => api<CashFlowReply>("/cash-flow"),
    select: readCashFlow,
    placeholderData: keepPreviousData,
  });
}

export type ItemReply = {
  id: number;
  name: string;
  organization: string | null;
  due_on: string;
  expected_on: string;
  cents: Digits;
  days_paid_late: number | null;
};

export type GroupReply = { total_cents: Digits; items: ItemReply[] };

export type ExpectedReply = { month: string; coming_in: GroupReply; going_out: GroupReply; likely_deals: GroupReply };

/** An invoice, a bill or a deal expected in a month, with the day it's expected. */
export type ExpectedItem = {
  id: number;
  /** An invoice's number, a bill's bill number or a deal's name. */
  name: string;
  organization: string | null;
  /** An invoice's or a bill's due date, or a deal's close date. */
  dueOn: string;
  expectedOn: string;
  cents: bigint;
  /** For an invoice, its customer's average days paid late (Y6). */
  daysPaidLate: number | null;
};

export type ExpectedGroup = { total: bigint; items: ExpectedItem[] };

/** What's expected in this month or one of the three after it (Y17), each group in expected date order. */
export type Expected = { month: string; comingIn: ExpectedGroup; goingOut: ExpectedGroup; likelyDeals: ExpectedGroup };

function readGroup(group: GroupReply): ExpectedGroup {
  return {
    total: exact(group.total_cents),
    items: group.items.map((item) => ({
      id: item.id,
      name: item.name,
      organization: item.organization,
      dueOn: item.due_on,
      expectedOn: item.expected_on,
      cents: exact(item.cents),
      daysPaidLate: item.days_paid_late,
    })),
  };
}

function readExpected(reply: ExpectedReply): Expected {
  return {
    month: reply.month,
    comingIn: readGroup(reply.coming_in),
    goingOut: readGroup(reply.going_out),
    likelyDeals: readGroup(reply.likely_deals),
  };
}

/** A month's list, read as its dialog opens (Y17). */
export function useExpected(month: string) {
  const today = useToday();
  return useQuery({
    queryKey: ["cash-flow", "expected", month, today],
    queryFn: () => api<ExpectedReply>(`/cash-flow/expected?month=${encodeURIComponent(month)}`),
    select: readExpected,
  });
}
