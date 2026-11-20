import type { ReactNode } from "react";
import type { TooltipContentProps } from "recharts";
import { monthName } from "@/lib/dashboard";
import type { MonthRow } from "./chartStyle";

/** A white panel with a soft shadow, showing the month's full figure (spec 2.6). */
export function MonthTooltip({ active, payload, figure }: Partial<TooltipContentProps> & { figure: (row: MonthRow) => string }) {
  const row = payload?.[0]?.payload as MonthRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg bg-panel px-3 py-2 text-[13px] shadow-[0_4px_16px_rgba(7,59,76,0.14)]">
      <div className="text-ink-muted">{monthName(row.month)}</div>
      <div className="font-mono font-medium text-ink tabular">{figure(row)}</div>
    </div>
  );
}

/** The 12-month total above a chart, such as "$511,000 won in the last 12 months". */
export function ChartTotal({ value, children }: { value: string; children: ReactNode }) {
  return (
    <div className="-mt-1.5 mb-2.5 flex items-baseline gap-2.5">
      <span className="font-mono text-[22px] leading-[30px] font-medium text-ink" data-figure="total">
        {value}
      </span>
      <span className="text-[13px] text-ink-subtle">{children}</span>
    </div>
  );
}
