import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import type { DealRow } from "../deals/hooks";
import { money } from "../shared/format";
import type { StageInfo } from "../shared/stages";
import type { Totals } from "./board";
import { DealCard } from "./DealCard";

type ColumnProps = {
  stage: StageInfo;
  cards: DealRow[];
  totals: Totals;
  activeId: number | null;
  saving: Set<number>;
  onOpen: (deal: DealRow) => void;
  onAdd: () => void;
};

function SortableCard({ deal, active, saving, onOpen }: { deal: DealRow; active: boolean; saving: boolean; onOpen: (d: DealRow) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: deal.id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  if (active) {
    // While dragging, the card's place keeps its size and shows a Sea Green line where it will land.
    return <DealCard ref={setNodeRef} style={style} deal={deal} className="placeholder" aria-hidden="true" />;
  }
  return (
    <DealCard
      ref={setNodeRef}
      style={style}
      deal={deal}
      className={saving ? "saving" : ""}
      {...attributes}
      {...listeners}
      aria-roledescription="Deal card. Press Space to pick it up, then use the arrow keys and Space to drop it."
      aria-label={`${deal.name}, ${money(deal.value)}`}
      onClick={() => onOpen(deal)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(deal);
        else listeners?.onKeyDown?.(event);
      }}
    />
  );
}

/** One stage: header with its totals, the cards, and Add deal (P5, P7). */
export function Column({ stage, cards, totals, activeId, saving, onOpen, onAdd }: ColumnProps) {
  const { setNodeRef } = useDroppable({ id: stage.key });
  const closed = stage.key === "won" ? "closed-won" : stage.key === "lost" ? "closed-lost" : "";
  return (
    <section className={`col ${closed}`} aria-label={stage.label}>
      <div className="col-head">
        <div className="col-title">
          <span className="dot" style={{ background: stage.color }} aria-hidden="true" />
          <h2>{stage.label}</h2>
          <span className="count" aria-label={`${totals.count} deals`}>
            {totals.count}
          </span>
        </div>
        <div className="col-sums">
          <span data-testid="column-value">{money(totals.value)}</span>
          {/* P5: every column, Won and Lost included, shows its expected revenue. */}
          <span className="muted" data-testid="column-expected">
            exp. {money(totals.expected)}
          </span>
        </div>
      </div>
      <SortableContext id={stage.key} items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="col-cards" ref={setNodeRef}>
          {cards.map((deal) => (
            <SortableCard key={deal.id} deal={deal} active={deal.id === activeId} saving={saving.has(deal.id)} onOpen={onOpen} />
          ))}
          {cards.length === 0 && <div className="col-empty">No deals at this stage yet.</div>}
        </div>
      </SortableContext>
      <button type="button" className="add-card" onClick={onAdd} aria-label={`Add deal in ${stage.label}`}>
        <Plus size={14} aria-hidden="true" />
        Add deal
      </button>
    </section>
  );
}
