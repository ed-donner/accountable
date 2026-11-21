import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Deal } from "@/api/types";
import { LateBadge } from "@/components/Badges";
import { formatDate, initials, money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A deal on the board (PIPE-4): name and organization, then value and close
 * date, then the main contact and any Late badge.
 */
export function DealCard({ deal, lifted, className }: { deal: Deal; lifted?: boolean; className?: string }) {
  return (
    <article
      className={cn("rounded-xl bg-panel px-3.5 py-[13px] text-left shadow-soft", lifted && "shadow-lifted", className)}
    >
      <div className="leading-[19px] font-semibold text-ink">{deal.name}</div>
      <div className="mt-0.5 text-[13px] text-ink-muted">{deal.organization.name}</div>
      {/* On a narrow column the date moves under the value, whole and on the right. */}
      <div className="tabular mt-2.5 flex flex-wrap items-baseline justify-between gap-x-2 font-mono text-[13px] leading-5">
        <span className="font-medium whitespace-nowrap text-ink">{money(deal.value)}</span>
        <span className={cn("ml-auto whitespace-nowrap", deal.is_late ? "text-raspberry-text" : "text-ink-muted")}>
          {formatDate(deal.close_date)}
        </span>
      </div>
      <div className="mt-2 flex min-h-[22px] items-center justify-between gap-2 text-[12px] text-ink-muted">
        {deal.main_contact ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="grid size-[22px] shrink-0 place-items-center rounded-full bg-band text-[10px] font-semibold text-band-ink-soft"
            >
              {initials(deal.main_contact.name)}
            </span>
            <span className="truncate">{deal.main_contact.name}</span>
          </span>
        ) : (
          <span className="text-ink-subtle italic">No main contact</span>
        )}
        {deal.is_late && <LateBadge />}
      </div>
    </article>
  );
}

/**
 * A card that can be dragged, and opened with a click or Enter. The pointer
 * sensor waits for 6px of movement, so a click still opens the deal, and
 * dnd-kit swallows the click that ends a drag.
 */
export function SortableDealCard({ deal, reducedMotion }: { deal: Deal; reducedMotion: boolean }) {
  const navigate = useNavigate();
  const { active, attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: deal.id,
      transition: reducedMotion ? null : { duration: 150, easing: "ease" },
    });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    listeners?.onKeyDown?.(event);
    if (event.key === "Enter" && !active) navigate(`/deals/${deal.id}`);
  }

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className="list-none">
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        // dnd-kit's own values, written out so the accessibility lint can see the card is a button.
        role="button"
        tabIndex={0}
        aria-roledescription="draggable deal"
        onKeyDown={onKeyDown}
        onClick={() => navigate(`/deals/${deal.id}`)}
        className={cn(
          "block cursor-grab rounded-xl transition-shadow duration-150 active:cursor-grabbing",
          // Where the card will land: a gap the size of the card.
          isDragging && "bg-slate-tint",
        )}
      >
        <DealCard deal={deal} className={isDragging ? "invisible" : "hover:shadow-hover"} />
      </div>
    </li>
  );
}
