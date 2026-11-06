import { price } from "../../lib/money";
import type { Change } from "./queries";

/** The en dash that stands for a figure with nothing to show. */
export const DASH = "–";

/** A sum from the backend's digits, as dollars and cents, exact past 2^53 cents. */
export function sum(cents: string): string {
  return price(BigInt(cents));
}

/** Tenths of a percent as "23.4%" or "-8.0%", or a dash with none. By whole numbers, so nothing drifts. */
export function margin(tenths: number | null): string {
  if (tenths === null) return DASH;
  return `${tenths < 0 ? "-" : ""}${Math.trunc(Math.abs(tenths) / 10)}.${Math.abs(tenths) % 10}%`;
}

function signed(value: number, text: string): string {
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : text;
}

/** A change as the backend worked it out: "+12%", "-8%", "0%", "+2.1 pts", "New", or a dash (X7). */
export function change(found: Change): string {
  if (found.kind === "new") return "New";
  if (found.kind === "none" || found.value === null) return DASH;
  const size = Math.abs(found.value);
  if (found.kind === "percent") return signed(found.value, `${size}%`);
  return signed(found.value, `${Math.trunc(size / 10)}.${size % 10} pts`);
}
