import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

// "Today" always comes from GET /api/meta, never from the browser's clock
// (plan, decision 5). A YYYY-MM-DD string is read with parseISO, which gives
// local midnight; new Date("2026-11-19") would mean midnight UTC, which is
// still Nov 18 in the Americas.

/** A YYYY-MM-DD string as a local day. */
export function parseDay(day: string): Date {
  return parseISO(day);
}

/** A local day as YYYY-MM-DD. */
export function dayString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function addDaysTo(day: string, days: number): string {
  return dayString(addDays(parseDay(day), days));
}

/** Whole days from a to b, as calendar days. */
export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseDay(to), parseDay(from));
}

/** How many days a follow-up is late, or 0. */
export function daysLate(followUp: string, today: string): number {
  return Math.max(0, daysBetween(followUp, today));
}

/** A datetime-local input's value ("2026-11-19T14:30", local time) as UTC with a Z. */
export function localInputToUtc(value: string): string {
  return parseISO(value)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
}

/** A UTC date-time as a datetime-local input's value, in local time. */
export function utcToLocalInput(value: string): string {
  return format(parseISO(value), "yyyy-MM-dd'T'HH:mm");
}

/** Now, as a datetime-local input's value. */
export function nowLocalInput(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm");
}
