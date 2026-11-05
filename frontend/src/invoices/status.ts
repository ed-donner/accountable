import type { ChipTone } from "../components/Chip";
import type { Method, ShowsAs } from "./queries";

/** Each of the six an invoice shows as (V3), in the order of the table's filter and its Status sort. */
export const SHOWN_AS: { key: ShowsAs; label: string; tone: ChipTone }[] = [
  { key: "draft", label: "Draft", tone: "quiet" },
  { key: "issued", label: "Issued", tone: "info" },
  { key: "part_paid", label: "Part paid", tone: "marigold" },
  { key: "overdue", label: "Overdue", tone: "alert" },
  { key: "paid", label: "Paid", tone: "seaGreen" },
  { key: "void", label: "Void", tone: "archived" },
];

export function shownAs(key: ShowsAs) {
  return SHOWN_AS.find((item) => item.key === key)!;
}

export function shownOrder(key: ShowsAs) {
  return SHOWN_AS.findIndex((item) => item.key === key);
}

export const METHODS: { key: Method; label: string }[] = [
  { key: "bank_transfer", label: "Bank transfer" },
  { key: "card", label: "Card" },
  { key: "check", label: "Check" },
  { key: "cash", label: "Cash" },
  { key: "other", label: "Other" },
];

export function methodLabel(key: Method) {
  return METHODS.find((item) => item.key === key)!.label;
}
