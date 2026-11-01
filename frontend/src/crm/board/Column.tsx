import { useDroppable } from "@dnd-kit/core";
import { memo, useMemo } from "react";

import { Icon } from "../../components/Icon";
import { money } from "../../lib/money";
import { STAGE_NAMES, figures, isOpen, slideSteps } from "../deals";
import type { Deal, Stage } from "../queries";
import { DealCard } from "./DealCard";

const HEADS: Record<Stage, string> = {
  new: "bg-sea-green text-ink",
  qualified: "bg-marigold text-ink",
  proposal: "bg-coral text-ink",
  negotiation: "bg-cerulean text-white",
  won: "bg-ink text-sea-mist",
  lost: "bg-raspberry text-white",
};

type Props = {
  stage: Stage;
  deals: Deal[];
  today: string;
  draggingId: number | null;
  landedId: number | null;
  /** Where a dragged card would land in this column, or null if it isn't over it. */
  place: number | null;
  /** One card's height and gap, in pixels, or 0 if no drag involves this column. */
  step: number;
  onAdd: (stage: Stage) => void;
  listRef: (stage: Stage, element: HTMLDivElement | null) => void;
};

const LIST_PADDING = 8;
const CARD_GAP = 8;

export const Column = memo(function Column({ stage, deals, today, draggingId, landedId, place, step, onAdd, listRef }: Props) {
  const { setNodeRef } = useDroppable({ id: stage });
  const totals = figures(deals);

  const cards = useMemo(() => {
    const draggedIndex = deals.findIndex((deal) => deal.id === draggingId);
    return deals.map((deal, index) => (
      <DealCard
        key={deal.id}
        deal={deal}
        today={today}
        dragging={deal.id === draggingId}
        landed={deal.id === landedId}
        offset={slideSteps(index, draggedIndex, place) * step}
      />
    ));
  }, [deals, today, draggingId, landedId, place, step]);

  return (
    <section aria-label={STAGE_NAMES[stage]} data-testid={`column-${stage}`} className="flex min-h-0 min-w-0 flex-col">
      <div className={`flex h-[142px] flex-none flex-col rounded-panel px-3.5 pt-3.5 pb-3 ${HEADS[stage]}`}>
        <div className="flex items-baseline justify-between text-[16px] leading-[22px] font-semibold">
          <span>{STAGE_NAMES[stage]}</span>
          <span className="num text-[15px] font-medium" data-testid="column-count">
            {totals.count}
          </span>
        </div>
        <div className="num mt-2 text-[24px] leading-[30px] font-medium tracking-[-0.02em]" data-testid="column-value">
          {money(totals.value)}
        </div>
        {isOpen(stage) && (
          <div className="num text-[13px] leading-[18px] font-medium" data-testid="column-expected">
            Expected {money(totals.expected)}
          </div>
        )}
        <button
          type="button"
          onClick={() => onAdd(stage)}
          aria-label={`Add deal to ${STAGE_NAMES[stage]}`}
          className="mt-auto flex w-fit items-center gap-1 rounded text-[14px] leading-5 font-semibold underline underline-offset-[3px]"
        >
          <Icon name="plus" size={15} />
          Add deal
        </button>
      </div>
      {/* The droppable sits inside the scroller, because dnd-kit only auto-scrolls a droppable's ancestors. */}
      <div
        ref={(element) => listRef(stage, element)}
        data-testid={`cards-${stage}`}
        className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]"
      >
        <div ref={setNodeRef} className="relative flex min-h-full flex-col gap-2 py-2">
          {place !== null && step > 0 && (
            <div
              data-testid="drop-gap"
              style={{ height: step - CARD_GAP, transform: `translateY(${LIST_PADDING + place * step}px)` }}
              className="pointer-events-none absolute inset-x-0 top-0 rounded-card bg-sea-mist/50 transition-transform duration-150"
            />
          )}
          {cards}
        </div>
      </div>
    </section>
  );
});
