import { ChevronLeft, ChevronRight } from "lucide-react";

import type { PeriodKind } from "./queries";

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

type Props = {
  kind: PeriodKind;
  onKind: (kind: PeriodKind) => void;
  /** The period shown, such as "March 2026". */
  label: string;
  /** It's the current period, which isn't over (X6). */
  current: boolean;
  /** The days the arrows go to, as the backend gave them, or null where an arrow is off (X5). */
  backOn: string | null;
  forwardOn: string | null;
  onDay: (day: string) => void;
};

const ARROW = "inline-flex size-9 items-center justify-center rounded-control bg-page enabled:hover:text-ink";

/**
 * The Month, Quarter and Year switch, the arrows and the period's label (X4 to X6). The switch keeps
 * the page's day, and an arrow sends the day the backend gave it, so this works out no date.
 */
export function PeriodSwitch({ kind, onKind, label, current, backOn, forwardOn, onDay }: Props) {
  return (
    <div className="flex items-center gap-3">
      <div role="group" aria-label="Period" className="flex h-9 rounded-control bg-page p-1">
        {KINDS.map((option) => {
          const on = option.value === kind;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => onKind(option.value)}
              className={`rounded-md px-3 text-[13px] ${on ? "bg-sea-green font-semibold text-midnight" : "font-medium hover:text-ink"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Earlier period"
          disabled={backOn === null}
          onClick={() => backOn !== null && onDay(backOn)}
          className={`${ARROW} ${backOn === null ? "text-muted opacity-60" : ""}`}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Later period"
          disabled={forwardOn === null}
          onClick={() => forwardOn !== null && onDay(forwardOn)}
          className={`${ARROW} ${forwardOn === null ? "text-muted opacity-60" : ""}`}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="text-[16px] leading-6 font-semibold">
        <span aria-live="polite">{label}</span>
        {current && <span className="font-normal text-muted"> so far</span>}
      </p>
    </div>
  );
}
