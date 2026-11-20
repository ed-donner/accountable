import { format, parseISO } from "date-fns";
import { daysBetween, parseDay } from "./dates";

const moneyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** Whole US dollars, never with cents: $48,500 (GEN-3). */
export function money(value: number): string {
  return moneyFormat.format(Math.round(value));
}

function trimmed(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/** Short money for chart axes: $1.2M, $48.5k, $50k (GEN-3). */
export function shortMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);
  if (amount >= 1_000_000) return `${sign}$${trimmed(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `${sign}$${trimmed(amount / 1_000)}k`;
  return `${sign}$${Math.round(amount)}`;
}

export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

/** Nov 19, 2026 (GEN-4). */
export function formatDate(day: string): string {
  return format(parseDay(day), "MMM d, yyyy");
}

/** Nov 19, 2026, 2:30 PM, in local time (GEN-4). */
export function formatDateTime(value: string): string {
  return format(parseISO(value), "MMM d, yyyy, h:mm a");
}

/** The local day of a UTC date-time: Nov 19, 2026. */
export function formatLocalDate(value: string): string {
  return format(parseISO(value), "MMM d, yyyy");
}

/** The dashboard's date line: Thursday, November 19 (DASH-1). */
export function dashboardDate(day: string): string {
  return format(parseDay(day), "EEEE, MMMM d");
}

/** "Today", "Tomorrow", a weekday within the week, or "3 days late". */
export function dueLabel(day: string, today: string): string {
  const days = daysBetween(today, day);
  if (days < 0) return `${plural(-days, "day")} late`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return format(parseDay(day), "EEEE");
  return formatDate(day);
}

const IRREGULAR: Record<string, string> = {
  activity: "activities",
  "open deal": "open deals",
};

export function pluralNoun(count: number, noun: string): string {
  if (count === 1) return noun;
  return IRREGULAR[noun] ?? `${noun}s`;
}

/** "1 contact", "40 contacts". */
export function plural(count: number, noun: string): string {
  return `${count.toLocaleString("en-US")} ${pluralNoun(count, noun)}`;
}

/** "40 contacts" when everything shows, "3 of 40 contacts" when filtered (TBL-6). */
export function countLine(shown: number, total: number, noun: string): string {
  if (shown === total) return plural(total, noun);
  return `${shown.toLocaleString("en-US")} of ${plural(total, noun)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
