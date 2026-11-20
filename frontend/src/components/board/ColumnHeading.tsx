import { useId } from "react";
import { Plus } from "lucide-react";
import { StageDot } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import type { Totals } from "@/lib/board";
import { money, pluralNoun } from "@/lib/format";
import { isClosed, STAGE_NAMES, type Stage } from "@/lib/rules";

/**
 * A column's heading, in the band: the stage, how many cards, their total value
 * and expected revenue (PIPE-1), and its own Add deal button (PIPE-7).
 */
export function ColumnHeading({
  stage,
  totals,
  onAdd,
}: {
  stage: Stage;
  totals: Totals;
  onAdd: (stage: Stage) => void;
}) {
  const titleId = useId();
  const name = STAGE_NAMES[stage];
  return (
    <section aria-labelledby={titleId} className="flex flex-col rounded-[14px] bg-band-panel px-3.5 pt-3.5 pb-3">
      <div className="flex items-center gap-2 text-[15px] font-semibold text-band-ink">
        <StageDot stage={stage} />
        <h2 id={titleId}>{name}</h2>
        <span className="tabular ml-auto font-mono text-[12px] font-medium text-band-muted">
          <span data-figure="count">{totals.count}</span>
          <span className="sr-only"> {pluralNoun(totals.count, "deal")}</span>
        </span>
      </div>
      <div className="tabular mt-2.5 font-mono text-[18px] leading-5 text-band-ink" data-figure="value">
        {money(totals.value)}
      </div>
      <div className="mb-3 text-[12px] text-band-muted">
        Expected{" "}
        <span className="tabular font-mono" data-figure="expected">
          {money(totals.expected)}
        </span>
      </div>
      {isClosed(stage) && <div className="mt-1 text-[12px] text-band-muted">Closed in the last 30 days</div>}
      <div className="mt-auto">
        <Button
          variant="band"
          size="sm"
          className="h-[30px] w-full"
          onClick={() => onAdd(stage)}
          aria-label={`Add deal in ${name}`}
        >
          <Plus className="size-3.5" /> Add deal
        </Button>
      </div>
    </section>
  );
}
