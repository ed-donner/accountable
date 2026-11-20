import type { ReactNode } from "react";
import type { Dashboard } from "@/api/types";
import { money, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

function Figure({ label, value, note, id }: { label: string; value: ReactNode; note: ReactNode; id: string }) {
  return (
    <div data-figure={id}>
      <div className="text-[13px] font-medium text-band-muted">{label}</div>
      <div className="mt-1 mb-0.5 font-mono text-[40px] leading-[50px] font-medium tracking-[-0.02em] text-band-ink">{value}</div>
      <div className="text-[13px] text-band-muted">{note}</div>
    </div>
  );
}

/** The four headline figures, in the band with no tiles around them (DASH-2). */
export function HeadlineFigures({ dashboard }: { dashboard: Dashboard }) {
  const { open_pipeline, expected_revenue, won_this_month, follow_up_counts } = dashboard;
  const overdue = follow_up_counts.overdue;
  return (
    <div className="mt-8 mb-9 grid grid-cols-4 gap-8">
      <Figure
        id="open-pipeline"
        label="Open pipeline"
        value={money(open_pipeline.value)}
        note={plural(open_pipeline.count, "open deal")}
      />
      <Figure
        id="expected-revenue"
        label="Expected revenue"
        value={<span className="text-sea-green">{money(expected_revenue)}</span>}
        note="Value times probability of close"
      />
      <Figure
        id="won-this-month"
        label="Won this month"
        value={money(won_this_month.value)}
        note={
          <>
            {plural(won_this_month.count, "deal")}. Last month <span className="font-mono">{money(won_this_month.last_month_value)}</span>
          </>
        }
      />
      <Figure
        id="follow-ups"
        label="Follow-ups"
        value={
          <span className={cn(overdue > 0 ? "text-band-alert" : "text-band-ink")}>
            {overdue}
            {/*
              The space sits in the smaller type, so it stays narrow. leading-none
              keeps the word from taking the figure's 50px line height, which
              made this figure 8px taller than the other three.
            */}
            <span className="ml-1.5 font-sans text-[18px] leading-none font-medium tracking-normal">{" "}overdue</span>
          </span>
        }
        note={
          <>
            <span className="font-mono">{follow_up_counts.due_soon}</span> due in the next 7 days
          </>
        }
      />
    </div>
  );
}
