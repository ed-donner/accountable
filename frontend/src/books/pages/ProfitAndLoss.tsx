import { useRef, useState } from "react";

import { LoadFailed } from "../../components/LoadFailed";
import { MoneyEmpty } from "../../components/MoneySection";
import { PageHeader } from "../../components/PageHeader";
import { EntriesDialog } from "../profit/EntriesDialog";
import { PeriodSwitch } from "../profit/PeriodSwitch";
import { Legend, ProfitChart, nothingYet } from "../profit/ProfitChart";
import { useProfitAndLoss, type Figure, type PeriodKind, type Target } from "../profit/queries";
import { Statement, registerKey } from "../profit/Statement";

export const EXPLANATION =
  "Revenue counts on the day an invoice is issued and expenses on the bill date, so profit isn't the same as cash.";

/**
 * The Profit and loss page (X1 to X19): the last 12 months as a chart, then the statement for a month,
 * quarter or year, and under any figure the entries behind it. One read gives the chart and the
 * statement, and the page works out nothing from it.
 */
export function ProfitAndLoss() {
  // The kind of period and the day the page is on, which is today until an arrow gives another (X4).
  const [kind, setKind] = useState<PeriodKind>("month");
  const [on, setOn] = useState<string | null>(null);
  const [opened, setOpened] = useState<Target | null>(null);
  const figures = useRef(new Map<string, HTMLButtonElement>());
  const opener = useRef<HTMLButtonElement | null>(null);
  const read = useProfitAndLoss(kind, on);
  const data = read.data;

  function register(key: string, element: HTMLButtonElement | null) {
    if (element) figures.current.set(key, element);
    else figures.current.delete(key);
  }

  function open(target: Target, from?: HTMLButtonElement) {
    opener.current = from ?? figures.current.get(registerKey(target.figure, target.from)) ?? null;
    setOpened(target);
  }

  function openFromStatement(figure: Figure, name: string, from: HTMLButtonElement) {
    if (!data) return;
    open({ figure, name, periodLabel: data.period.label, from: data.period.first, to: data.period.last }, from);
  }

  return (
    <>
      <PageHeader title="Profit and loss" />
      <div className="flex flex-col gap-3 px-6 pb-6">
        <p className="-mt-1 text-muted">{EXPLANATION}</p>
        {data && <LoadFailed keeping error={read.error} onRetry={() => void read.refetch()} />}
        <section aria-label="Last 12 months" className="panel flex h-[360px] flex-col px-[18px] py-4">
          <div className="flex items-start justify-between gap-6">
            <h2 className="text-[16px] leading-6 font-semibold">Last 12 months</h2>
            {data && <Legend />}
          </div>
          {data ? (
            nothingYet(data.months) ? (
              <MoneyEmpty>The chart will show here once you've issued an invoice or added a bill.</MoneyEmpty>
            ) : (
              <ProfitChart months={data.months} onOpen={(target) => open(target)} register={register} />
            )
          ) : (
            <div className="flex flex-1 flex-col justify-center">
              <LoadFailed error={read.error} onRetry={() => void read.refetch()} />
            </div>
          )}
        </section>
        {data && (
          <section
            aria-label="Statement"
            className={`panel px-[18px] py-4 ${read.isPlaceholderData ? "opacity-60" : ""}`}
          >
            <Statement
              period={data.period}
              previousLabel={data.previous?.label ?? null}
              onOpen={openFromStatement}
              register={register}
              switcher={
                <PeriodSwitch
                  kind={kind}
                  onKind={setKind}
                  label={data.period.label}
                  current={data.period.current}
                  backOn={data.period.back_on}
                  forwardOn={data.period.forward_on}
                  onDay={setOn}
                />
              }
            />
          </section>
        )}
      </div>
      {opened && (
        <EntriesDialog target={opened} onClose={() => setOpened(null)} onCloseFocus={() => opener.current?.focus()} />
      )}
    </>
  );
}
