import { format, parseISO } from "date-fns";
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { LoadFailed } from "../components/LoadFailed";
import { MoneyEmpty, MoneyFigure } from "../components/MoneySection";
import { price } from "../lib/money";
import { CashFlowChart, FILLS } from "./CashFlowChart";
import { MonthDialog } from "./MonthDialog";
import { useCashFlow, type CashFlow, type CashMonth } from "./queries";

function Swatch({ fill }: { fill: string }) {
  return <span aria-hidden="true" className="size-2.5 flex-none rounded-full" style={{ background: fill }} />;
}

function LineSwatch({ dashed }: { dashed?: boolean }) {
  return (
    <svg aria-hidden="true" width="16" height="2" className="flex-none">
      <line
        x1="0"
        y1="1"
        x2="16"
        y2="1"
        stroke={FILLS.line}
        strokeWidth={2}
        strokeDasharray={dashed ? "4 3" : undefined}
      />
    </svg>
  );
}

function LegendItem({ swatch, children }: { swatch: ReactNode; children: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {swatch}
      {children}
    </li>
  );
}

type HeaderProps = { flow: CashFlow | undefined; withDeals: boolean; onDeals: (on: boolean) => void };

/** The heading, then at the right the legend and the Likely deals switch (Y15). */
function Header({ flow, withDeals, onDeals }: HeaderProps) {
  const balance = Boolean(flow?.opening);
  return (
    <div className="flex items-center justify-between gap-6">
      <h3 id="cash-flow-heading" className="text-[16px] leading-6 font-semibold">
        Cash flow
      </h3>
      {flow && (
        <div className="flex items-center gap-6 text-[13px] leading-[18px]">
          <ul aria-label="Legend" className="flex items-center gap-4">
            <LegendItem swatch={<Swatch fill={FILLS.in} />}>Money in</LegendItem>
            <LegendItem swatch={<Swatch fill={FILLS.out} />}>Money out</LegendItem>
            {balance && <LegendItem swatch={<LineSwatch />}>Cash</LegendItem>}
            {balance && <LegendItem swatch={<LineSwatch dashed />}>Forecast</LegendItem>}
            {balance && withDeals && <LegendItem swatch={<Swatch fill={FILLS.band} />}>Likely deals</LegendItem>}
          </ul>
          {/* No balance line, so nothing for the band to sit on. */}
          {balance && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={withDeals}
                onChange={(event) => onDeals(event.target.checked)}
              />
              Likely deals
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function endName(flow: CashFlow) {
  return format(parseISO(`${flow.months[flow.months.length - 1].month}-01`), "MMMM");
}

/** Cash today and the forecast's end, or how to add the opening balance they count from (Y16, Y18). */
function Figures({ flow, withDeals }: { flow: CashFlow; withDeals: boolean }) {
  if (!flow.opening || flow.cashToday === null || flow.forecastEnd === null) {
    return (
      <p className="mt-2 flex min-h-[66px] items-center">
        <span>
          No opening balance yet. Add one in{" "}
          <Link to="/settings" className="link">
            Company settings
          </Link>{" "}
          to see the cash balance.
        </span>
      </p>
    );
  }
  return (
    <div className="mt-2 grid min-h-[66px] grid-cols-[repeat(3,minmax(0,220px))] gap-6">
      <MoneyFigure label="Cash today" amount={price(flow.cashToday)} count="" />
      <MoneyFigure label={`End of ${endName(flow)}`} amount={price(flow.forecastEnd)} count="Expected" />
      {/* Its place is kept while the switch is off, so nothing moves when it appears. */}
      <div>
        {withDeals && flow.forecastEndWithDeals !== null && (
          <MoneyFigure label="With likely deals" amount={price(flow.forecastEndWithDeals)} count="" />
        )}
      </div>
    </div>
  );
}

function nothingYet(flow: CashFlow) {
  return (
    !flow.opening &&
    flow.months.every(
      (month) => month.in === 0n && month.out === 0n && month.expectedIn === 0n && month.expectedOut === 0n,
    )
  );
}

function shown(cents: bigint | null) {
  return cents === null ? "None" : price(cents);
}

/** Every month's figures, for anyone who can't see the chart. */
function MonthsTable({ flow, withDeals }: { flow: CashFlow; withDeals: boolean }) {
  return (
    <table className="sr-only">
      <caption>Cash flow for the last 12 months and the next 3</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col">Money in</th>
          <th scope="col">Money out</th>
          <th scope="col">Expected in</th>
          <th scope="col">Expected out</th>
          {withDeals && <th scope="col">Likely deals</th>}
          <th scope="col">Cash at the end</th>
          {withDeals && <th scope="col">With likely deals</th>}
        </tr>
      </thead>
      <tbody>
        {flow.months.map((month) => (
          <tr key={month.month}>
            <th scope="row">
              {month.label} {month.year}
              {month.kind === "current" ? ", so far" : month.kind === "forecast" ? ", forecast" : ""}
            </th>
            <td>{price(month.in)}</td>
            <td>{price(month.out)}</td>
            <td>{price(month.expectedIn)}</td>
            <td>{price(month.expectedOut)}</td>
            {withDeals && <td>{price(month.likely)}</td>}
            <td>{shown(month.balance)}</td>
            {withDeals && <td>{shown(month.balanceWithDeals)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The cash flow's row at the top of the Money section (Y1 to Y22). It reads its own route, so
 * a row that can't load says so and leaves the rest of the section showing (Y21). The switch
 * is the row's own, so it's off each time the dashboard opens (Y15).
 */
export function CashFlowRow() {
  const flow = useCashFlow();
  const [withDeals, setWithDeals] = useState(false);
  const [opened, setOpened] = useState<CashMonth | null>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const data = flow.data;

  return (
    <div className="flex flex-col">
      {data && <LoadFailed keeping error={flow.error} onRetry={() => void flow.refetch()} />}
      <section aria-labelledby="cash-flow-heading" className="panel flex h-[360px] flex-col px-[18px] py-4">
        <Header flow={data} withDeals={withDeals} onDeals={setWithDeals} />
        {data ? (
          <>
            <Figures flow={data} withDeals={withDeals} />
            {nothingYet(data) ? (
              <MoneyEmpty>Cash flow will show here once money comes in or goes out.</MoneyEmpty>
            ) : (
              <CashFlowChart flow={data} withDeals={withDeals} labelRefs={labels} onOpen={setOpened} />
            )}
            <MonthsTable flow={data} withDeals={withDeals} />
          </>
        ) : (
          <div className="flex flex-1 flex-col justify-center">
            <LoadFailed error={flow.error} onRetry={() => void flow.refetch()} />
          </div>
        )}
      </section>
      {opened && (
        <MonthDialog
          month={opened}
          withDeals={withDeals}
          onClose={() => setOpened(null)}
          onCloseFocus={() => labels.current.get(opened.month)?.focus()}
        />
      )}
    </div>
  );
}
