import { useState } from "react";

import { LoadFailed } from "../../components/LoadFailed";
import { PageHeader } from "../../components/PageHeader";
import { money } from "../../lib/money";
import { useToday } from "../../lib/useToday";
import { Board } from "../board/Board";
import { boardTotals } from "../deals";
import { DealForm } from "../forms/DealForm";
import { useDeals, useMoveDeal, type Stage } from "../queries";

export function Pipeline() {
  const deals = useDeals();
  const move = useMoveDeal();
  const today = useToday();
  const [adding, setAdding] = useState<Stage | null>(null);

  // Left out until the deals arrive, because $0 would read as a real figure.
  const totals = deals.data && boardTotals(deals.data);

  return (
    <div className="relative flex h-[calc(100vh-68px)] min-h-[692px] flex-col">
      <PageHeader title="Pipeline" baseline>
        {totals && (
          <div className="ml-auto flex items-baseline gap-7 text-[13px]">
            <div className="flex items-baseline gap-2">
              <b className="font-semibold">Open pipeline</b>
              <span className="num text-[20px] leading-[26px] font-medium tracking-[-0.02em]" data-testid="board-value">
                {money(totals.value)}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <b className="font-semibold">Expected revenue</b>
              <span
                className="num text-[20px] leading-[26px] font-medium tracking-[-0.02em]"
                data-testid="board-expected"
              >
                {money(totals.expected)}
              </span>
            </div>
          </div>
        )}
      </PageHeader>
      <LoadFailed onPage keeping={deals.data !== undefined} error={deals.error} onRetry={() => deals.refetch()} />
      {deals.data && <Board deals={deals.data} today={today} onMove={move.mutate} onAdd={setAdding} />}
      {deals.data?.length === 0 && (
        <div className="absolute inset-x-0 top-1/2 flex justify-center">
          <p className="text-muted">No deals yet. Add the first one.</p>
        </div>
      )}
      {adding && <DealForm defaultStage={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}
