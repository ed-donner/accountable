import { Check } from "lucide-react";
import { shortDate } from "./format";

type Props = { date: string; status: "overdue" | "upcoming" | "later" | "done"; today: string };

const WORDS = { overdue: "overdue", upcoming: "due", later: "due", done: "done" };

/** A follow-up date: Raspberry overdue, Cerulean upcoming, grey with a check when done. */
export function FollowUpChip({ date, status, today }: Props) {
  const label = date === today ? "Today" : shortDate(date);
  return (
    <span className={`chip ${status}`} aria-label={`Follow-up ${label}, ${WORDS[status]}`}>
      {status === "done" && <Check size={12} aria-hidden="true" />}
      {label}
    </span>
  );
}
