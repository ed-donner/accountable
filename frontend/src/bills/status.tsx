import { Chip, type ChipTone } from "../components/Chip";
import type { Bill } from "./queries";

export type BillStatus = "unpaid" | "overdue" | "paid";

/** In the order the table sorts them, overdue first (E13). */
export const STATUSES: BillStatus[] = ["overdue", "unpaid", "paid"];

export const STATUS_LABELS: Record<BillStatus, string> = { unpaid: "Unpaid", overdue: "Overdue", paid: "Paid" };

const TONES: Record<BillStatus, ChipTone> = { unpaid: "info", overdue: "alert", paid: "seaGreen" };

/**
 * Worked out from today, never saved, so a bill turns overdue at midnight with nobody
 * saving it. One due today isn't overdue yet, as with late deals (E8).
 */
export function billStatus(bill: Pick<Bill, "due_date" | "paid_on">, today: string): BillStatus {
  if (bill.paid_on !== null) return "paid";
  return bill.due_date < today ? "overdue" : "unpaid";
}

export function BillStatusChip({ status }: { status: BillStatus }) {
  return <Chip tone={TONES[status]}>{STATUS_LABELS[status]}</Chip>;
}

export const PAID_IN_FUTURE = "The paid date can't be in the future";
export const PAID_BEFORE_BILL = "The paid date can't be before the bill date";

/** What's wrong with a paid date, if anything, as the backend checks it (E9, E11). */
export function paidDateProblem(paidOn: string, billDate: string, today: string): string | null {
  if (paidOn > today) return PAID_IN_FUTURE;
  if (billDate && paidOn < billDate) return PAID_BEFORE_BILL;
  return null;
}
