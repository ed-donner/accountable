import { format, parseISO } from "date-fns";

export function formatDate(value: string): string {
  return format(parseISO(value), "MMM d, yyyy");
}

export function formatShortDate(value: string): string {
  return format(parseISO(value), "MMM d");
}

export function formatDateTime(value: string): string {
  return format(parseISO(value), "MMM d, h:mm a");
}

export function formatDay(value: Date): string {
  return format(value, "MMM d, yyyy");
}

/** Today as a plain date, in the computer's own time zone. */
export function todayIso(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}
