// The board's pure logic: columns, totals and the optimistic result of a move (P4 to P6).
// The backend applies the real rules; this only predicts them so totals change at once.
import type { DealRow } from "../deals/hooks";
import { STAGES, stageInfo, type Stage } from "../shared/stages";

export type Columns = Record<Stage, number[]>;
export type Totals = { count: number; value: number; expected: number };
export type Move = {
  id: number;
  stage: Stage;
  afterId: number | null;
  beforeId: number | null;
};

const byPosition = (a: DealRow, b: DealRow) => a.position - b.position || a.id - b.id;

/** Card ids per column, top to bottom. */
export function buildColumns(deals: DealRow[]): Columns {
  const columns = Object.fromEntries(STAGES.map((s) => [s.key, [] as number[]])) as Columns;
  for (const deal of [...deals].sort(byPosition)) columns[deal.stage].push(deal.id);
  return columns;
}

export function totals(deals: DealRow[]): Totals {
  return deals.reduce(
    (sum, d) => ({
      count: sum.count + 1,
      value: sum.value + d.value,
      expected: sum.expected + d.expected_revenue,
    }),
    { count: 0, value: 0, expected: 0 },
  );
}

/** P5: the board's figures count open deals only. */
export function boardTotals(deals: DealRow[]): Totals {
  return totals(deals.filter((d) => stageInfo(d.stage).open));
}

/** Where a card ended up after a drag: its column and the cards above and below it. */
export function moveFrom(columns: Columns, id: number): Move | null {
  for (const stage of Object.keys(columns) as Stage[]) {
    const index = columns[stage].indexOf(id);
    if (index === -1) continue;
    return {
      id,
      stage,
      afterId: index > 0 ? columns[stage][index - 1] : null,
      beforeId: index < columns[stage].length - 1 ? columns[stage][index + 1] : null,
    };
  }
  return null;
}

/**
 * P4 with a search on: the drop's neighbours are the visible cards only, so a hidden
 * card may sit between them. The card goes directly under the visible card above it
 * (or to the very top of the column), ahead of any hidden cards. With no search this
 * changes nothing.
 */
export function withHiddenCards(deals: DealRow[], move: Move): Move {
  const column = buildColumns(deals.filter((d) => d.id !== move.id))[move.stage];
  const index = move.afterId === null ? -1 : column.indexOf(move.afterId);
  if (move.afterId !== null && index === -1) return move;
  return { ...move, beforeId: column[index + 1] ?? null };
}

/** True when a move leaves the card where it was. */
export function isNoMove(deals: DealRow[], move: Move): boolean {
  const before = moveFrom(buildColumns(deals), move.id);
  return (
    before !== null &&
    before.stage === move.stage &&
    before.afterId === move.afterId &&
    before.beforeId === move.beforeId
  );
}

/** The deals as they'll look once the server applies the move (D3, D4, P4). */
export function applyMove(deals: DealRow[], move: Move, today: string): DealRow[] {
  const find = (id: number | null) => (id === null ? undefined : deals.find((d) => d.id === id));
  const above = find(move.afterId)?.position;
  const below = find(move.beforeId)?.position;
  const position =
    above !== undefined && below !== undefined
      ? (above + below) / 2
      : above !== undefined
        ? above + 1
        : below !== undefined
          ? below - 1
          : 1;
  return deals.map((deal) => {
    if (deal.id !== move.id) return deal;
    const moved = { ...deal, position };
    if (deal.stage !== move.stage) {
      const info = stageInfo(move.stage);
      moved.stage = move.stage;
      moved.probability = info.usualProbability;
      if (!info.open) {
        moved.close_date = today;
        moved.is_late = false;
      }
    }
    moved.expected_revenue = Math.round((moved.value * moved.probability) / 100);
    return moved;
  });
}

/** The search box: name, organization or main contact. */
export function matches(deal: DealRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [deal.name, deal.organization_name, deal.contact_name].some((v) =>
    v?.toLowerCase().includes(q),
  );
}
