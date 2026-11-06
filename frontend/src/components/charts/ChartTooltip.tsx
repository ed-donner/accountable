import type { ReactNode } from "react";

/**
 * The value leads and the label follows, because the reader already has the label. A tooltip
 * with no one figure to lead with, such as a cash flow month with no balance, has the label alone.
 */
export function ChartTooltip({ value, label }: { value?: ReactNode; label: ReactNode }) {
  return (
    <div className="rounded-control bg-raised px-3 py-2 shadow-(--shadow-tooltip)">
      {value !== undefined && <div className="num text-[14px] leading-5 font-medium">{value}</div>}
      <div className="text-[13px] leading-[18px] text-muted">{label}</div>
    </div>
  );
}
