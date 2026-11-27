import { differenceInCalendarDays, format, isSameDay, isSameYear, parseISO, subDays } from 'date-fns'

const whole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const withCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

/** Money always shows its currency: `$12,500` (spec 2.8, rule 9). Cents only when there are some. */
export function money(cents: number): string {
  return cents % 100 === 0 ? whole.format(cents / 100) : withCents.format(cents / 100)
}

/** Short money for chart axes only: `$1.2M`, `$30K`, `$0`. */
export function moneyAxis(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${trim(dollars / 1_000_000)}M`
  if (dollars >= 1_000) return `$${trim(dollars / 1_000)}K`
  return `$${Math.round(dollars)}`
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '')
}

/** Today on this computer as "2026-11-15", the same "today" the server uses (D9). */
export const todayISO = (now = new Date()) => format(now, 'yyyy-MM-dd')

/** A date-only value ("2026-11-15") as a local date, so it never shifts a day. */
export function day(value: string): Date {
  return parseISO(value)
}

/** "Nov 15", or "Jan 20, 2027" when it's not this year. */
export function shortDate(value: string, now = new Date()): string {
  const d = day(value)
  return isSameYear(d, now) ? format(d, 'MMM d') : format(d, 'MMM d, yyyy')
}

/** "Sunday, November 15, 2026" */
export function longDate(value: string): string {
  return format(day(value), 'EEEE, MMMM d, yyyy')
}

/** "Nov 15, 2026, 9:42 AM" */
export function exactTime(iso: string): string {
  return format(parseISO(iso), 'MMM d, yyyy, h:mm a')
}

/** "Today, 9:42 AM", "Yesterday, 4:15 PM", "Nov 7, 2:30 PM" (D20). */
export function relativeTime(iso: string, now = new Date()): string {
  const d = parseISO(iso)
  const time = format(d, 'h:mm a')
  if (isSameDay(d, now)) return `Today, ${time}`
  if (isSameDay(d, subDays(now, 1))) return `Yesterday, ${time}`
  return isSameYear(d, now) ? `${format(d, 'MMM d')}, ${time}` : `${format(d, 'MMM d, yyyy')}, ${time}`
}

/** Whole days from `today` to `value`: negative when it's in the past. */
export function daysFrom(today: string, value: string): number {
  return differenceInCalendarDays(day(value), day(today))
}

/** "4 days overdue", "Today", "In 3 days" for a follow-up date. */
export function dueText(today: string, value: string): string {
  const n = daysFrom(today, value)
  if (n === 0) return 'Today'
  if (n < 0) return `${-n} ${n === -1 ? 'day' : 'days'} overdue`
  return `In ${n} ${n === 1 ? 'day' : 'days'}`
}

/** The value for an <input type="datetime-local">, in local time. */
export function toLocalInput(iso: string | Date): string {
  return format(typeof iso === 'string' ? parseISO(iso) : iso, "yyyy-MM-dd'T'HH:mm")
}

/** Dollars typed in a form to whole cents (D4). */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}
