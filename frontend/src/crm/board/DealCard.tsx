import { memo } from "react";
import { Link } from "react-router";

import { Chip } from "../../components/Chip";
import { formatDate } from "../../lib/dates";
import { money } from "../../lib/money";
import { isLate } from "../deals";
import type { Deal } from "../queries";

export const CARD_CLASS = "block flex-none rounded-card px-[13px] py-3";

function background(late: boolean) {
  return late ? "bg-late-tint" : "bg-panel";
}

function Line({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <div title={text} className={`truncate ${muted ? "text-[13px] leading-[18px] text-muted" : "mt-1 font-semibold"}`}>
      {text}
    </div>
  );
}

function CardContent({ deal, late }: { deal: Deal; late: boolean }) {
  return (
    <>
      <div className="num flex items-center justify-between text-[19px] leading-[26px] font-medium tracking-[-0.02em]">
        <span>{money(deal.value)}</span>
        {late && (
          <span className="font-sans tracking-normal">
            <Chip tone="alert">Late</Chip>
          </span>
        )}
      </div>
      <Line text={deal.name} />
      <Line text={deal.organization_name ?? "None"} muted />
      <Line text={deal.main_contact_name ?? "None"} muted />
      <div className="num mt-1.5 flex justify-between text-[12px] leading-[18px] text-muted">
        <span>{deal.probability}%</span>
        <span>{formatDate(deal.close_date)}</span>
      </div>
    </>
  );
}

type CardProps = {
  deal: Deal;
  today: string;
  /** The card being dragged keeps its place in the list, unseen, until it lands. */
  dragging: boolean;
  landed: boolean;
  /** Pixels up or down, while another card is dragged. */
  offset: number;
};

function sameCard(a: CardProps, b: CardProps) {
  // Only what's shown counts. A drop renumbers its column, and that shouldn't
  // redraw every card in it.
  return (
    a.today === b.today &&
    a.dragging === b.dragging &&
    a.landed === b.landed &&
    a.offset === b.offset &&
    a.deal.id === b.deal.id &&
    a.deal.value === b.deal.value &&
    a.deal.name === b.deal.name &&
    a.deal.organization_name === b.deal.organization_name &&
    a.deal.main_contact_name === b.deal.main_contact_name &&
    a.deal.probability === b.deal.probability &&
    a.deal.close_date === b.deal.close_date &&
    a.deal.stage === b.deal.stage
  );
}

export const DealCard = memo(function DealCard({ deal, today, dragging, landed, offset }: CardProps) {
  const late = isLate(deal, today);
  return (
    <Link
      to={`/deals/${deal.id}`}
      draggable={false}
      data-deal-id={deal.id}
      data-testid="deal-card"
      data-deal={deal.name}
      aria-roledescription="draggable deal"
      aria-describedby="board-instructions"
      title={`${deal.name}, ${deal.organization_name ?? "no organization"}`}
      style={offset ? { transform: `translateY(${offset}px)` } : undefined}
      className={`${CARD_CLASS} ${background(late)} cursor-grab ${dragging ? "opacity-0" : ""} ${landed ? "animate-settle" : ""}`}
    >
      <CardContent deal={deal} late={late} />
    </Link>
  );
}, sameCard);

/** What follows the pointer. A dragged card lifts with a soft shadow. */
export function DealCardLifted({ deal, today }: { deal: Deal; today: string }) {
  const late = isLate(deal, today);
  return (
    <div className={`${CARD_CLASS} ${background(late)} cursor-grabbing shadow-[0_10px_28px_rgba(7,59,76,0.22)]`}>
      <CardContent deal={deal} late={late} />
    </div>
  );
}
