import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { LoadFailed } from "../../components/LoadFailed";
import { PageHeader } from "../../components/PageHeader";
import { formatDate } from "../../lib/dates";
import { useToday } from "../../lib/useToday";
import { BalanceBars, CHART_HEIGHT } from "../BalanceBars";
import { BalanceColumns } from "../BalanceColumns";
import { figures as figuresOf, stops, type Figure } from "../balance";
import { EntriesDialog, type Opened } from "../EntriesDialog";
import { DateSlider } from "../DateSlider";
import { balancesQuery, useBalances } from "../queries";

/**
 * What the business owns and what it owes on a day chosen from the last 12 months (X1 to X18).
 * It keeps no records: every figure is a balance read from the books, and every figure opens the entries behind it.
 */
export function BalanceSheet() {
  const today = useToday();
  const all = useMemo(() => stops(today), [today]);
  // Counted back from today, so the slider keeps its place when the day changes (X2).
  const [back, setBack] = useState(0);
  const index = all.length - 1 - back;
  const day = all[index].day;

  const balances = useBalances(day);
  const { data } = balances;
  const client = useQueryClient();
  const landed = balances.isSuccess && !balances.isPlaceholderData;
  useEffect(() => {
    if (!landed) return;
    for (const stop of all) void client.prefetchQuery(balancesQuery(stop.day));
  }, [landed, all, client]);

  const shown = useMemo(() => (data ? figuresOf(data.accounts) : null), [data]);
  const [opened, setOpened] = useState<Opened | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  function open(figure: Figure, button: HTMLElement) {
    opener.current = button;
    setOpened({ id: figure.id, name: figure.name, cents: figure.cents, day: data!.on });
  }

  return (
    <>
      <PageHeader title="Balance sheet" />
      <div className="px-6 pb-6">
        <section aria-label="Balance sheet" className="panel w-[960px] max-w-full px-6 py-5">
          <h2 aria-live="polite" className="mb-2">
            {formatDate(day)}
          </h2>
          <DateSlider stops={all} index={index} onChange={(next) => setBack(all.length - 1 - next)} />
          {balances.error && !data ? (
            <LoadFailed error={balances.error} onRetry={() => void balances.refetch()} />
          ) : (
            <>
              <LoadFailed keeping={data !== undefined} error={balances.error} onRetry={() => void balances.refetch()} />
              <div className="mt-3">
                {shown && data ? (
                  <BalanceBars figures={shown} day={data.on} />
                ) : (
                  <div aria-hidden="true" style={{ height: CHART_HEIGHT }} />
                )}
              </div>
              <div className="mt-4">
                <BalanceColumns figures={shown} onOpen={open} />
              </div>
            </>
          )}
        </section>
      </div>
      {opened && (
        <EntriesDialog opened={opened} onClose={() => setOpened(null)} onCloseFocus={() => opener.current?.focus()} />
      )}
    </>
  );
}
