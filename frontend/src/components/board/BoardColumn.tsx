import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { PipelineColumn } from "@/api/types";
import { columnId } from "@/lib/board";
import { isClosed, STAGE_NAMES } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { SortableDealCard } from "./DealCard";

/**
 * A column's cards, below its heading. Each column has its own SortableContext
 * and is a drop target too, so an empty column still takes cards. It scrolls on
 * its own when it holds more cards than fit.
 */
export function BoardColumn({
  column,
  highlighted,
  reducedMotion,
}: {
  column: PipelineColumn;
  highlighted: boolean;
  reducedMotion: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: columnId(column.stage) });
  const name = STAGE_NAMES[column.stage];

  return (
    <SortableContext id={column.stage} items={column.deals.map((deal) => deal.id)} strategy={verticalListSortingStrategy}>
      <ul
        ref={setNodeRef}
        aria-label={`${name} deals`}
        className={cn(
          // A thin scrollbar, with room kept for it in every column so the cards line up.
          "flex min-h-0 flex-col gap-2.5 overflow-y-auto rounded-2xl p-1.5 transition-colors duration-150 [scrollbar-color:#B9C9CE_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]",
          highlighted && "bg-[#E1E9EB]",
        )}
      >
        {column.deals.map((deal) => (
          <SortableDealCard key={deal.id} deal={deal} reducedMotion={reducedMotion} />
        ))}
        {column.deals.length === 0 && (
          <li className="list-none px-3 py-8 text-center text-[13px] text-ink-subtle">
            {isClosed(column.stage) ? "None closed in the last 30 days" : "No deals here"}
          </li>
        )}
      </ul>
    </SortableContext>
  );
}
