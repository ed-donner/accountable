import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BandProps = {
  title: ReactNode;
  /** The short line under the title, such as "40 contacts" */
  subtitle?: ReactNode;
  /** Above the title, such as a link back to the table */
  above?: ReactNode;
  /** Beside the title, such as badges */
  beside?: ReactNode;
  /** On the right: the headline figures and the main button */
  right?: ReactNode;
  /** Below the heading: figures, the stage bar or the column headings */
  children?: ReactNode;
  className?: string;
  wide?: boolean;
};

/** The Midnight band under the top bar, with no line between them. */
export function Band({ title, subtitle, above, beside, right, children, className, wide }: BandProps) {
  return (
    <section className={cn("on-band bg-band px-8 pt-7 pb-9 text-band-ink-soft", className)}>
      <div className={cn("mx-auto w-full", !wide && "max-w-[1440px]")}>
        {above}
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] leading-9 font-semibold text-band-ink">{title}</h1>
              {beside}
            </div>
            {subtitle !== undefined && <div className="mt-1 text-band-muted">{subtitle}</div>}
          </div>
          {right && <div className="flex shrink-0 items-center gap-9">{right}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

/** A figure in the band, such as "Open pipeline $1,011,000". */
export function BandFigure({ label, value, tone }: { label: string; value: ReactNode; tone?: "sea" }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[13px] font-medium text-band-muted">{label}</span>
      <span className={cn("font-mono text-[26px] leading-[34px] tabular", tone === "sea" ? "text-sea-green" : "text-band-ink")}>
        {value}
      </span>
    </div>
  );
}
