import { endOfMonth, format, parseISO, subMonths } from "date-fns";

import type { CentsSum } from "../lib/money";

/** One of the 12 days the slider stops at (X2). */
export type Stop = {
  /** The day, such as "2026-10-31". */
  day: string;
  /** The month's first three letters, and "Today" for the last. */
  label: string;
  /** Set on the first stop and each January's, which have the year under them. */
  year?: number;
};

/** The last day of each of the 11 months before this one, oldest first, then today (X2). */
export function stops(today: string): Stop[] {
  const now = parseISO(today);
  const found = Array.from({ length: 12 }, (_, index) => {
    const last = index === 11;
    const date = last ? now : endOfMonth(subMonths(now, 11 - index));
    const first = index === 0;
    return {
      day: format(date, "yyyy-MM-dd"),
      label: last ? "Today" : format(date, "MMM"),
      ...(first || date.getMonth() === 0 ? { year: date.getFullYear() } : {}),
    };
  });
  return found;
}

export type FigureId = "cash" | "receivable" | "payable" | "taxPayable" | "ownersEquity" | "profit";

/** The expense accounts, which Profit to date takes off Revenue's balance (J1). */
const EXPENSE_KEYS = [
  "expense_software",
  "expense_contractors",
  "expense_travel",
  "expense_office",
  "expense_marketing",
  "expense_other",
] as const;

const REVENUE_KEY = "revenue";

type Row = {
  id: FigureId;
  name: string;
  /** The books' accounts behind the figure. */
  accounts: readonly string[];
  /** Assets add on a debit. The others, Profit to date included, add on a credit (J2, X12). */
  debitAdds: boolean;
  /** The round swatch's Tailwind class. */
  swatch: string;
  /** The color for the bars, from the tokens. */
  fill: string;
  side: "left" | "right";
};

/** The six figures in the columns' order, left Cash and Receivable, right the other four, with the one place each is named. */
export const ROWS: readonly Row[] = [
  {
    id: "cash",
    name: "Cash",
    accounts: ["cash"],
    debitAdds: true,
    swatch: "bg-sea-green",
    fill: "var(--color-sea-green)",
    side: "left",
  },
  {
    id: "receivable",
    name: "Receivable",
    accounts: ["receivable"],
    debitAdds: true,
    swatch: "bg-marigold",
    fill: "var(--color-marigold)",
    side: "left",
  },
  {
    id: "payable",
    name: "Payable",
    accounts: ["payable"],
    debitAdds: false,
    swatch: "bg-coral",
    fill: "var(--color-coral)",
    side: "right",
  },
  {
    id: "taxPayable",
    name: "Tax payable",
    accounts: ["tax_payable"],
    debitAdds: false,
    swatch: "bg-cerulean",
    fill: "var(--color-cerulean)",
    side: "right",
  },
  {
    id: "ownersEquity",
    name: "Owner's equity",
    accounts: ["owners_equity"],
    debitAdds: false,
    swatch: "bg-ink",
    fill: "var(--color-ink)",
    side: "right",
  },
  {
    id: "profit",
    name: "Profit to date",
    accounts: [REVENUE_KEY, ...EXPENSE_KEYS],
    debitAdds: false,
    swatch: "bg-bar-soft",
    fill: "var(--color-bar-soft)",
    side: "right",
  },
];

export type Figure = Row & { cents: bigint };

/** The six rows from a reply's balances, in exact cents. Profit to date is Revenue less each expense account (X4). */
export function figures(balances: { key: string; balance_cents: CentsSum }[]): Figure[] {
  const byKey = new Map(balances.map((balance) => [balance.key, BigInt(balance.balance_cents)]));
  const of = (key: string) => byKey.get(key) ?? 0n;
  const profit = EXPENSE_KEYS.reduce((left, key) => left - of(key), of(REVENUE_KEY));
  return ROWS.map((row) => ({ ...row, cents: row.id === "profit" ? profit : of(row.accounts[0]) }));
}

export type Totals = { left: bigint; right: bigint; difference: bigint; balanced: boolean };

/** Each column's total, and the left less the right (X5, X6). Nothing is rounded or corrected. */
export function totals(all: Pick<Figure, "side" | "cents">[]): Totals {
  const sum = (side: Figure["side"]) => all.filter((figure) => figure.side === side).reduce((s, f) => s + f.cents, 0n);
  const left = sum("left");
  const right = sum("right");
  return { left, right, difference: left - right, balanced: left === right };
}

type EntryLines = { lines: { account: string; debit_cents: number; credit_cents: number }[] };

/** What an entry's lines in a figure's accounts add to it, by J2's sides: a credit to Revenue adds to Profit to date, a debit to an expense takes away (X12). */
export function effect(entry: EntryLines, id: FigureId): bigint {
  const row = ROWS.find((each) => each.id === id)!;
  return entry.lines
    .filter((line) => row.accounts.includes(line.account))
    .reduce((sum, line) => {
      const moved = BigInt(line.debit_cents) - BigInt(line.credit_cents);
      return sum + (row.debitAdds ? moved : -moved);
    }, 0n);
}

/** What happened, in plain words (X13). */
export const EVENT_WORDS: Record<string, string> = {
  invoice_issued: "Invoice issued",
  payment_recorded: "Payment recorded",
  bill_added: "Bill added",
  bill_paid: "Bill paid",
  opening_balance_set: "Opening balance set",
  invoice_voided: "Invoice voided",
  payment_deleted: "Payment deleted",
  bill_changed: "Bill changed",
  bill_unpaid: "Bill marked unpaid",
  bill_deleted: "Bill deleted",
  opening_balance_changed: "Opening balance changed",
  opening_balance_cleared: "Opening balance cleared",
};
