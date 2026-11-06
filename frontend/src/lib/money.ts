export function money(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

/** Shortened with the currency, for chart axes: $40k, $1.2M, and -$40k below zero. */
export function shortMoney(value: number): string {
  if (value < 0) return `-${shortMoney(-value)}`;
  if (value >= 1_000_000) return `$${+(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1000) return `$${+(value / 1000).toFixed(1)}k`;
  return `$${value}`;
}

/**
 * A sum of amounts in whole cents, as digits, with a minus sign in front below zero, such as
 * "9200000000000001" or "-425000". Each amount fits a JavaScript number exactly, but a sum of
 * many can pass 2^53 cents, so it's read as a BigInt (E20, Y20).
 */
export type CentsSum = string;

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

/** The amount's size and whether it's below zero, so the sign can go before the currency. */
function sizeAndSign(cents: number | bigint): { size: number | bigint; sign: string } {
  if (typeof cents === "bigint") return cents < 0n ? { size: -cents, sign: "-" } : { size: cents, sign: "" };
  return cents < 0 ? { size: -cents, sign: "-" } : { size: cents, sign: "" };
}

/**
 * A price from whole cents, always with its cents: $49.50, $1,250.00 (G3), and -$4,250.00 below
 * zero, as a cash balance can be (Y12). A sum of many amounts can pass what a JavaScript number
 * holds exactly, about 9 quadrillion, so it comes as a BigInt.
 */
export function price(cents: number | bigint): string {
  const { size, sign } = sizeAndSign(cents);
  const parts = dollarsAndCents(size);
  return `${sign}$${parts.dollars.toLocaleString("en-US")}.${parts.cents}`;
}

/** A price as the form shows it for editing: 1250.00 (G4), or -1250.00 below zero. */
export function priceText(cents: number): string {
  const { size, sign } = sizeAndSign(cents);
  const parts = dollarsAndCents(size);
  return `${sign}${parts.dollars}.${parts.cents}`;
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

/**
 * An amount that may be below zero, with a minus sign in front, such as an overdrawn account's
 * opening balance: -1,250.00 or -$1,250.00 (B24). Read as parsePrice reads a price, in whole
 * cents, or null if it isn't one or is past the limit either way.
 */
export function parseSignedPrice(text: string, most = MAX_CENTS): number | null {
  const typed = text.trim();
  const below = typed.startsWith("-");
  const rest = below ? typed.slice(1) : typed;
  // parsePrice drops spaces at the ends, which would let "- 5" through.
  if (rest !== rest.trimStart()) return null;
  const cents = parsePrice(rest, most);
  return cents !== null && below && cents > 0 ? -cents : cents;
}
