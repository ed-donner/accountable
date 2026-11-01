export function money(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

/** Shortened with the currency, for chart axes: $40k, $1.2M. */
export function shortMoney(value: number): string {
  if (value >= 1_000_000) return `$${+(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1000) return `$${+(value / 1000).toFixed(1)}k`;
  return `$${value}`;
}
