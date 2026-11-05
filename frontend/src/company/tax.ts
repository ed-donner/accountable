import { MAX_CENTS } from "../lib/money";

// The sums on a quote or an invoice, in whole cents (B16, B17), done as the backend's
// company/tax.py does them, with the same cases from shared/totals-cases.json, so what a
// page shows before it saves is what the backend saves.

export const MAX_QUANTITY = 1_000_000;
export const QUANTITY_MESSAGE = "Enter a whole number from 1 to 1,000,000";

/** $1 trillion, the most a deal is worth. Under it, every amount here is exact as a JavaScript number. */
export const MAX_SUBTOTAL_CENTS = MAX_CENTS;
export const SUBTOTAL_MESSAGE = "Keep the subtotal to $1 trillion or less";

const PER_PERCENT = 1000;
/** A rate of 100%, in thousandths of a percent. */
const ALL = 100n * BigInt(PER_PERCENT);

export type Line = { quantity: number; unit_price_cents: number };
export type Totals = { subtotal_cents: number; tax_cents: number; total_cents: number };

/** A rate as the backend sends it, such as "8.875", in thousandths of a percent, read by its digits (B7). */
export function rateThousandths(rate: string): number {
  const [whole, places = ""] = rate.split(".");
  return Number(whole || "0") * PER_PERCENT + Number(places.padEnd(3, "0"));
}

export function lineAmount({ quantity, unit_price_cents }: Line): number {
  return quantity * unit_price_cents;
}

/**
 * The tax at a rate in thousandths of a percent, to the nearest cent, with halves rounding up.
 * The multiplying goes through BigInt, because a subtotal past about $900 million times the
 * rate is past what a JavaScript number holds exactly, and the cent could come out wrong.
 */
export function taxOn(subtotalCents: number, rate: number): number {
  return Number((BigInt(subtotalCents) * BigInt(rate) + ALL / 2n) / ALL);
}

/**
 * Tax once, on the subtotal, never line by line, where each line's rounding would add up.
 * A subtotal past the limit, which the backend refuses, may not be exact, but stays past it.
 */
export function totals(lines: Line[], rate: string): Totals {
  const subtotal = lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const tax = taxOn(subtotal, rateThousandths(rate));
  return { subtotal_cents: subtotal, tax_cents: tax, total_cents: subtotal + tax };
}

// Digits, with or without commas in threes.
const QUANTITY = /^(\d{1,3}(?:,\d{3})+|\d+)$/;

/** A typed quantity as a whole number from 1 to a million, or null if it isn't one (B17). */
export function parseQuantity(text: string): number | null {
  const match = QUANTITY.exec(text.trim());
  if (!match) return null;
  const quantity = Number(match[1].replaceAll(",", ""));
  return quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}
