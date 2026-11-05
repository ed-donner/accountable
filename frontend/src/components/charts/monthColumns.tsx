import { shortMoney } from "../../lib/money";
import { AXIS_TEXT } from "./axes";

/**
 * What the Money section's two month charts, Payments received and Spending by category,
 * share, so they line up side by side: one column a month, every month named, the money axis
 * inside the panel on the right, and the current month marked "so far" above its column.
 */
export const MONTH_CHART = {
  /** Room above the plot for "so far" over a column as tall as the axis. */
  top: 28,
  axisWidth: 52,
  monthsHeight: 24,
  columnWidth: 18,
};

export const MUTED_AXIS_TEXT = { ...AXIS_TEXT, fill: "var(--color-muted)" };

/** Money is in cents here, and the axis shows dollars. */
export function centsAxis(cents: number) {
  return shortMoney(cents / 100);
}

type LabelProps = { x?: number | string; y?: number | string; width?: number | string; index?: number };

/** "so far" over the current month's column, the last, for a LabelList on the column's top. */
export function soFarOver(last: number) {
  return function SoFar({ x = 0, y = 0, width = 0, index }: LabelProps) {
    if (index !== last) return null;
    return (
      <text
        x={Number(x) + Number(width) / 2}
        y={Number(y) - 8}
        textAnchor="middle"
        style={{ ...AXIS_TEXT, fill: "var(--color-ink)", fontWeight: 500 }}
      >
        so far
      </text>
    );
  };
}
