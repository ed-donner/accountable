import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "../../components/PageHeader";
import { todayIso } from "../../lib/dates";
import { money } from "../../lib/money";
import { Board } from "../board/Board";
import { STAGE_NAMES, boardTotals, type Move } from "../deals";
import { DealForm } from "../forms/DealForm";
import { useDeals, useMoveDeal, type MoveResult, type Stage } from "../queries";

function moveMessage({ deal, changes }: MoveResult): string | null {
  if (changes.close_date === null) return null;
  const parts = [`Marked as ${STAGE_NAMES[deal.stage]}.`, "Close date set to today."];
  if (changes.new_customer) parts.push(`${changes.new_customer} is now a customer.`);
  return parts.join(" ");
}

export function Pipeline() {
  const deals = useDeals();
  const move = useMoveDeal();
  const today = todayIso();
  const [adding, setAdding] = useState<Stage | null>(null);

  const mutate = useRef(move.mutate);
  mutate.current = move.mutate;

  const onMove = useCallback((next: Move) => {
    mutate.current(next, {
      onSuccess: (result) => {
        const message = moveMessage(result);
        if (message) toast.success(message);
      },
      onError: () => toast.error("Couldn't move that deal, so it's back where it was."),
    });
  }, []);

  const totals = boardTotals(deals.data ?? []);

  return (
    <div className="relative flex h-[calc(100vh-68px)] min-h-[692px] flex-col">
      <PageHeader title="Pipeline" baseline>
        <div className="ml-auto flex items-baseline gap-7 text-[13px]">
          <div className="flex items-baseline gap-2">
            <b className="font-semibold">Open pipeline</b>
            <span className="num text-[20px] leading-[26px] font-medium tracking-[-0.02em]" data-testid="board-value">
              {money(totals.value)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <b className="font-semibold">Expected revenue</b>
            <span className="num text-[20px] leading-[26px] font-medium tracking-[-0.02em]" data-testid="board-expected">
              {money(totals.expected)}
            </span>
          </div>
        </div>
      </PageHeader>
      {deals.data && <Board deals={deals.data} today={today} onMove={onMove} onAdd={setAdding} />}
      {deals.data?.length === 0 && (
        <div className="absolute inset-x-0 top-1/2 flex justify-center">
          <p className="text-muted">No deals yet. Add the first one.</p>
        </div>
      )}
      {adding && <DealForm defaultStage={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}
