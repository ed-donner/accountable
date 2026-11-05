import type { ChipTone } from "../components/Chip";
import { money } from "../lib/money";
import { listed } from "../lib/words";
import type { Accepted, QuoteStatus } from "./queries";

/** How a quote's status shows: expired is a sent quote past its valid-until date (Q7). */
export type ShownStatus = QuoteStatus | "expired";

/** The order the Status column sorts in, and the figures above the table take (Q33, Q34). */
export const STATUS_ORDER: ShownStatus[] = ["draft", "sent", "expired", "accepted", "declined"];

export const STATUS_NAMES: Record<ShownStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  expired: "Expired",
  accepted: "Accepted",
  declined: "Declined",
};

/** The tones agreed for documents' statuses in visual-design.md. */
export const STATUS_TONES: Record<ShownStatus, ChipTone> = {
  draft: "quiet",
  sent: "info",
  expired: "alert",
  accepted: "seaGreen",
  declined: "alert",
};

/**
 * Expired from the day after its valid-until date, and still Sent on the date itself, as a deal due
 * today isn't late. Dates are plain dates, so comparing their text compares the days.
 */
export function shownStatus(quote: { status: QuoteStatus; valid_until: string }, today: string): ShownStatus {
  return quote.status === "sent" && quote.valid_until < today ? "expired" : quote.status;
}

/** A quote's value is its subtotal, before tax, as a deal's value is (Q16). */
type Counted = { status: QuoteStatus; valid_until: string; subtotal_cents: number };

export type Figure = { count: number; value_cents: number };

/** The count and value of every quote, and of each shown status, whatever the search (Q34). */
export function figures(rows: Counted[], today: string): Record<ShownStatus | "all", Figure> {
  const empty = (): Figure => ({ count: 0, value_cents: 0 });
  const result = {
    all: empty(),
    draft: empty(),
    sent: empty(),
    expired: empty(),
    accepted: empty(),
    declined: empty(),
  };
  for (const row of rows) {
    for (const figure of [result.all, result[shownStatus(row, today)]]) {
      figure.count += 1;
      figure.value_cents += row.subtotal_cents;
    }
  }
  return result;
}

/** A quote's value in whole dollars, to the nearest with halves up, as accepting sets the deal's (Q22). */
export function dealValue(subtotalCents: number): number {
  const rounded = subtotalCents + 50;
  return (rounded - (rounded % 100)) / 100;
}

/** What Accept's question says it will change, after "Accept QT-0004?" (Q22). */
export function acceptChanges(deal: string, subtotalCents: number, declining: string[]): string {
  const declined = declining.length > 0 ? `, and ${listed(declining)} will be marked declined` : "";
  return `${deal} will move to Won with a value of ${money(dealValue(subtotalCents))}${declined}. This can't be undone.`;
}

/** What accepting changed, each part only when it applies, as the board's message after a drop on Won (Q22, P8). */
export function acceptedMessage({ deal, changes }: Accepted): string {
  const parts = ["Quote accepted.", `${deal.name} is now Won at ${money(deal.value)}.`];
  if (changes.close_date) parts.push("Close date set to today.");
  if (changes.new_customer) parts.push(`${changes.new_customer} is now a customer.`);
  return parts.join(" ");
}
