// The pipeline board's logic, worked out in the browser so the board changes
// the moment a card is dropped (PIPE-6; plan, decision 12).

import type { Deal, Pipeline, PipelineColumn } from "@/api/types";
import { expectedValue, isClosed, isLate, isOpen, USUAL_PROBABILITY, type Stage } from "./rules";

/** A column's id as a drop target, beside the deal ids. */
export const COLUMN_PREFIX = "column:";

export function columnId(stage: Stage): string {
  return `${COLUMN_PREFIX}${stage}`;
}

export type Totals = { count: number; value: number; expected: number };
export type BoardTotals = Totals & { late: number };

/** The deal with the server's stage rules applied (STG-2, STG-4, STG-5). */
function withStage(deal: Deal, stage: Stage, today: string): Deal {
  if (stage === deal.stage) return deal;
  const probability = USUAL_PROBABILITY[stage];
  const closeDate = isClosed(stage) ? today : deal.close_date;
  return {
    ...deal,
    stage,
    probability,
    expected_value: expectedValue(deal.value, probability),
    close_date: closeDate,
    is_late: isLate(stage, closeDate, today),
  };
}

/**
 * A new board with the card moved to toStage, just above beforeId, or at the
 * bottom when beforeId is null. A move to another stage applies the server's
 * rules: the usual probability, today for Won and Lost, and the close date
 * kept when a deal is reopened. The board it's given is left alone.
 */
export function moveCard(board: Pipeline, dealId: number, toStage: Stage, beforeId: number | null, today: string): Pipeline {
  const card = board.columns.flatMap((column) => column.deals).find((deal) => deal.id === dealId);
  if (!card) return board;
  const moved = withStage(card, toStage, today);

  return {
    ...board,
    columns: board.columns.map((column) => {
      const deals = column.deals.filter((deal) => deal.id !== dealId);
      if (column.stage !== toStage) {
        return deals.length === column.deals.length ? column : { ...column, deals };
      }
      const place = beforeId === null ? -1 : deals.findIndex((deal) => deal.id === beforeId);
      deals.splice(place === -1 ? deals.length : place, 0, moved);
      return { ...column, deals };
    }),
  };
}

function sum(deals: Deal[]): Totals {
  return {
    count: deals.length,
    value: deals.reduce((total, deal) => total + deal.value, 0),
    // The sum of each deal's rounded figure, as on the dashboard.
    expected: deals.reduce((total, deal) => total + deal.expected_value, 0),
  };
}

/** A column heading's figures (PIPE-1). */
export function columnTotals(column: PipelineColumn): Totals {
  return sum(column.deals);
}

/** The figures above the board: the open deals, and how many are late (PIPE-3). */
export function boardTotals(board: Pipeline): BoardTotals {
  const open = board.columns.filter((column) => isOpen(column.stage)).flatMap((column) => column.deals);
  return { ...sum(open), late: open.filter((deal) => deal.is_late).length };
}

/** The id of the card just below the dropped card, or null if there isn't one. */
export function beforeIdAfterDrop(column: PipelineColumn, dealId: number): number | null {
  const index = column.deals.findIndex((deal) => deal.id === dealId);
  if (index === -1) return null;
  return column.deals[index + 1]?.id ?? null;
}
