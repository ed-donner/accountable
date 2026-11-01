import type { Deal, Meta, Stage } from "./queries";

export const STAGES: Stage[] = ["new", "qualified", "proposal", "negotiation", "won", "lost"];
export const OPEN_STAGES: Stage[] = ["new", "qualified", "proposal", "negotiation"];

export const STAGE_NAMES: Record<Stage, string> = {
  new: "New",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export function isOpen(stage: Stage): boolean {
  return OPEN_STAGES.includes(stage);
}

/**
 * Value times probability, to the nearest dollar, with halves rounding up.
 * Whole-number arithmetic, so it agrees with the backend to the dollar.
 */
export function expectedRevenue(value: number, probability: number): number {
  const scaled = value * probability + 50;
  return (scaled - scaled % 100) / 100;
}

export function isLate(deal: Pick<Deal, "stage" | "close_date">, today: string): boolean {
  return isOpen(deal.stage) && deal.close_date < today;
}

export type Figures = { count: number; value: number; expected: number };

type Countable = Pick<Deal, "value" | "probability">;

export function figures(deals: Countable[]): Figures {
  return {
    count: deals.length,
    value: deals.reduce((total, deal) => total + deal.value, 0),
    expected: deals.reduce((total, deal) => total + expectedRevenue(deal.value, deal.probability), 0),
  };
}

export function boardTotals(deals: Deal[]): Figures {
  return figures(deals.filter((deal) => isOpen(deal.stage)));
}

export function columns(deals: Deal[]): Record<Stage, Deal[]> {
  const result = Object.fromEntries(STAGES.map((stage) => [stage, [] as Deal[]])) as Record<Stage, Deal[]>;
  for (const deal of deals) result[deal.stage].push(deal);
  for (const stage of STAGES) result[stage].sort((a, b) => a.position - b.position || a.id - b.id);
  return result;
}

/**
 * How many places a card moves up or down while another is dragged, so the
 * column shows where the dragged card will land.
 *
 * draggedIndex is -1 if the dragged card started in another column. place is
 * where it would land, counting the column without it, or null if it isn't over
 * this column.
 */
export function slideSteps(index: number, draggedIndex: number, place: number | null): number {
  const withoutDragged = draggedIndex !== -1 && index > draggedIndex ? index - 1 : index;
  const wanted = place !== null && withoutDragged >= place ? withoutDragged + 1 : withoutDragged;
  return wanted - index;
}

export type Move = { dealId: number; stage: Stage; beforeDealId: number | null };

/**
 * The board's best guess at what a move will do, so it can show straight away.
 * The server's reply always replaces it.
 */
export function applyMove(deals: Deal[], move: Move, usual: Meta["stages"], today: string): Deal[] {
  const moving = deals.find((deal) => deal.id === move.dealId);
  if (!moving) return deals;

  const changed = moving.stage !== move.stage;
  const moved: Deal = { ...moving, stage: move.stage };
  if (changed) {
    moved.probability = usual.find((stage) => stage.key === move.stage)?.probability ?? moving.probability;
    moved.expected_revenue = expectedRevenue(moved.value, moved.probability);
    if (!isOpen(move.stage)) moved.close_date = today;
  }

  const target = columns(deals.filter((deal) => deal.id !== move.dealId))[move.stage];
  const place = target.findIndex((deal) => deal.id === move.beforeDealId);
  target.splice(place === -1 ? target.length : place, 0, moved);
  const placed = new Map(target.map((deal, position) => [deal.id, { ...deal, position }]));

  return deals.map((deal) => placed.get(deal.id) ?? deal);
}
