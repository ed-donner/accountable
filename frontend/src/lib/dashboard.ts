// Wording and small sums for the dashboard (spec 1.9).

import { format, parseISO } from "date-fns";
import { addDaysTo, dayString, parseDay } from "./dates";
import { money } from "./format";

type Month = { month: string; revenue: number; deals: number };

/** "2026-08" as "Aug", for a chart's axis. */
export function monthLabel(month: string): string {
  return format(parseDay(`${month}-01`), "MMM");
}

/** "2026-08" as "August 2026", for a chart's tooltip. */
export function monthName(month: string): string {
  return format(parseDay(`${month}-01`), "MMMM yyyy");
}

/** The month with the highest figure, the latest one on a tie, or null when all are 0. */
function highest(months: Month[], figure: (m: Month) => number): Month | null {
  let best: Month | null = null;
  for (const month of months) {
    if (figure(month) > 0 && (!best || figure(month) >= figure(best))) best = month;
  }
  return best;
}

const fullMonth = (month: string) => format(parseDay(`${month}-01`), "MMMM");

/** "Revenue won over the last 12 months: $511,000. Highest in August: $140,000." */
export function revenueSummary(months: Month[]): string {
  const total = months.reduce((sum, m) => sum + m.revenue, 0);
  const best = highest(months, (m) => m.revenue);
  const line = `Revenue won over the last 12 months: ${money(total)}.`;
  return best ? `${line} Highest in ${fullMonth(best.month)}: ${money(best.revenue)}.` : line;
}

/** "Deals won over the last 12 months: 10. Most in May: 2." */
export function dealsWonSummary(months: Month[]): string {
  const total = months.reduce((sum, m) => sum + m.deals, 0);
  const best = highest(months, (m) => m.deals);
  const line = `Deals won over the last 12 months: ${total}.`;
  return best ? `${line} Most in ${fullMonth(best.month)}: ${best.deals}.` : line;
}

/**
 * The share carried from each funnel step to the next, as a whole percent, or
 * null after a step with nothing in it (plan, decision 16).
 */
export function funnelShares(steps: { value: number }[]): (number | null)[] {
  return steps.slice(1).map((step, i) => {
    const before = steps[i].value;
    return before > 0 ? Math.round((step.value / before) * 100) : null;
  });
}

/** A follow-up's day on the dashboard: "Nov 13". */
export function shortDay(day: string): string {
  return format(parseDay(day), "MMM d");
}

/** When a recent activity happened, in local time: "Today, 2:30 PM", "Yesterday, 4:30 PM", "Nov 16, 3:20 PM". */
export function recentWhen(occurredAt: string, today: string): string {
  const moment = parseISO(occurredAt);
  const day = dayString(moment);
  const time = format(moment, "h:mm a");
  if (day === today) return `Today, ${time}`;
  if (day === addDaysTo(today, -1)) return `Yesterday, ${time}`;
  if (day.slice(0, 4) !== today.slice(0, 4)) return format(moment, "MMM d, yyyy");
  return `${format(moment, "MMM d")}, ${time}`;
}

/**
 * Round axis steps from 0 past the largest figure: 1, 2, 2.5 or 5 times a power
 * of ten, about four steps in all. 140,000 gives 0, 50k, 100k and 150k.
 */
export function niceTicks(max: number, steps = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / steps;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((n) => n * power >= raw) ?? 10) * power;
  const ticks: number[] = [];
  for (let tick = 0; tick < max + step; tick += step) ticks.push(tick);
  return ticks;
}
