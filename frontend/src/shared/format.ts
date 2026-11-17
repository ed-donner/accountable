// Money and dates as the spec shows them (G9, G10).

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** `$48,200`: tables, cards and figures. */
export function money(amount: number): string {
  return dollars.format(Math.round(amount));
}

/** `$1.2M`, `$80K`: only where space is short, such as chart axes. */
export function shortMoney(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const trim = (n: number) => (Math.round(n * 10) / 10).toString();
  if (abs >= 1_000_000) return `${sign}$${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trim(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}

/** `16 Nov 2026` from `2026-11-16` (or an ISO timestamp). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = parts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** `16 Nov`, for chips and short lists. */
export function shortDate(iso: string): string {
  const [, m, d] = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

/** `Monday 16 November 2026`, for the dashboard header. */
export function longDate(iso: string): string {
  const [y, m, d] = parts(iso);
  const weekday = DAYS[new Date(y, m - 1, d).getDay()];
  return `${weekday} ${d} ${LONG_MONTHS[m - 1]} ${y}`;
}

/** `Nov` from `2026-11`, for chart axes. */
export function monthLabel(yearMonth: string): string {
  return MONTHS[Number(yearMonth.slice(5, 7)) - 1];
}

/** `Nov 2026` from `2026-11`, for tooltips. */
export function monthYear(yearMonth: string): string {
  return `${monthLabel(yearMonth)} ${yearMonth.slice(0, 4)}`;
}

/** `Today`, `Yesterday` or `12 Nov`, relative to the user's today. */
export function relativeDay(iso: string, today: string): string {
  if (iso.slice(0, 10) === today) return "Today";
  const [y, m, d] = parts(today);
  const yesterday = new Date(y, m - 1, d - 1);
  const yIso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  if (iso.slice(0, 10) === yIso) return "Yesterday";
  return shortDate(iso);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
