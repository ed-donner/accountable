/** The five parts of how late money is, shared by the dashboard's How late and the aged balances (X1, X12, V29). */
export type LatePart = "not_due" | "1_30" | "31_60" | "61_90" | "over_90";

/** In order, from calm to alarming. The colors are tokens, so dark mode changes them. */
export const LATE_PARTS: { key: LatePart; label: string; color: string }[] = [
  { key: "not_due", label: "Not yet due", color: "var(--color-cerulean)" },
  { key: "1_30", label: "1 to 30 days", color: "var(--color-marigold)" },
  { key: "31_60", label: "31 to 60 days", color: "var(--color-coral)" },
  { key: "61_90", label: "61 to 90 days", color: "var(--color-raspberry)" },
  { key: "over_90", label: "Over 90 days", color: "var(--color-deep-raspberry)" },
];

export function latePart(key: LatePart) {
  return LATE_PARTS.find((part) => part.key === key)!;
}
