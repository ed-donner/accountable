export function money(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

/** Shortened with the currency, for chart axes: $40k, $1.2M. */
export function shortMoney(value: number): string {
  if (value >= 1_000_000) return `$${+(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1000) return `$${+(value / 1000).toFixed(1)}k`;
  return `$${value}`;
}

/** The most a price can be: $1 trillion in cents, the backend's limit (G3). */
export const MAX_CENTS = 100_000_000_000_000;

/** Whole cents as dollars and cents, by whole numbers only, so nothing drifts by a cent. */
function dollarsAndCents(cents: number | bigint) {
  if (typeof cents === "bigint") {
    const rest = cents % 100n;
    return { dollars: (cents - rest) / 100n, cents: String(rest).padStart(2, "0") };
  }
  const rest = cents % 100;
  return { dollars: (cents - rest) / 100, cents: String(rest).padStart(2, "0") };
}

/**
 * A price from whole cents, always with its cents: $49.50, $1,250.00 (G3). A sum of many
 * amounts can pass what a JavaScript number holds exactly, about 9 quadrillion, so it comes as a BigInt.
 */
export function price(cents: number | bigint): string {
  const parts = dollarsAndCents(cents);
  return `$${parts.dollars.toLocaleString("en-US")}.${parts.cents}`;
}

/** A price as the form shows it for editing: 1250.00 (G4). */
export function priceText(cents: number): string {
  const parts = dollarsAndCents(cents);
  return `${parts.dollars}.${parts.cents}`;
}

// An optional $, dollars with or without commas in threes, then a point with one or two figures.
const PRICE = /^\$?(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/;

/**
 * A price as people write it, such as 49.5 or $1,250.00, in whole cents, or null if it
 * isn't one (G4). The dollars and the cents are read as two whole numbers, never
 * through floating point, where 0.29 times 100 is 28.999999999999996. An amount that
 * isn't a price, such as a payment, can have a higher limit than a price's.
 */
export function parsePrice(text: string, most = MAX_CENTS): number | null {
  const match = PRICE.exec(text.trim());
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const dollars = Number((match[1] ?? "0").replaceAll(",", ""));
  const cents = Number((match[2] ?? "0").padEnd(2, "0"));
  const total = dollars * 100 + cents;
  return total <= most ? total : null;
}
