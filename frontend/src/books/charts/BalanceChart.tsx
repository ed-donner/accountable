import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { AXIS_TEXT as CHART_AXIS_TEXT, niceTop } from "../../components/charts/axes";
import { ChartTooltip } from "../../components/charts/ChartTooltip";
import { useSize } from "../../components/charts/useSize";
import { price, shortMoney } from "../../lib/money";
import type { AccountMonth } from "../queries";

const AXIS_TEXT = { ...CHART_AXIS_TEXT, fontWeight: 500 };
// Text on the Sea Green fill is Midnight in both modes, because Sea Mist can't be read on it.
const ON_FILL = "var(--color-midnight)";
const MARGIN = { top: 24, right: 0, bottom: 0, left: 0 };
/** The fill runs half a month past the first and last, to the panel's edges. */
const EDGE = 0.5;

type Row = {
  x: number;
  fill: number;
  solid?: number;
  dashed?: number;
  label?: string;
  balance?: bigint;
  current?: boolean;
};

type TipProps = { active?: boolean; payload?: { payload: Row }[] };

function Tip({ active, payload }: TipProps) {
  const row = payload?.[0]?.payload;
  if (!active || row?.balance === undefined) return null;
  return <ChartTooltip value={price(row.balance)} label={row.current ? `${row.label} so far` : row.label} />;
}

type DotProps = { cx?: number; cy?: number; payload?: Row };

function EndDot({ cx, cy, payload }: DotProps) {
  if (!payload?.current || cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={5} fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth={2} />;
}

/** The axis runs from the lowest balance, or zero, up to a round figure above the highest, or zero. */
export function balanceRange(values: number[]) {
  const highest = Math.max(0, ...values);
  const lowest = Math.min(0, ...values);
  const top = highest > 0 ? niceTop(highest) : lowest < 0 ? 0 : 100;
  const bottom = lowest < 0 ? -niceTop(-lowest) : 0;
  return { top, bottom };
}

/**
 * An account's balance at the end of each month, as the dashboard's revenue chart draws its months: a
 * Sea Green fill under an ink line, the month labels on the fill, this month's segment dashed and ended in
 * a ringed dot, and the money axis inside on the right (J18). The heights are numbers in dollars. The tooltip
 * and the table behind the chart have the exact figures.
 */
export function BalanceChart({ months, name }: { months: AccountMonth[]; name: string }) {
  const { ref, size } = useSize();
  const dollars = months.map((month) => Number(month.balance) / 100);
  const { top, bottom } = balanceRange(dollars);
  const last = months.length - 1;
  const shown = size.width > 0 && size.height > MARGIN.top;
  const ticks = bottom < 0 ? [bottom, 0, top] : [0.25, 0.5, 0.75, 1].map((share) => top * share);

  const rows: Row[] = [
    { x: -EDGE, fill: dollars[0] },
    ...months.map((month, index) => ({
      x: index,
      fill: dollars[index],
      // The current month isn't finished, so its segment is dashed and can't read as a fall.
      solid: index < last ? dollars[index] : undefined,
      dashed: index >= last - 1 ? dollars[index] : undefined,
      label: month.label,
      balance: month.balance,
      current: index === last,
    })),
    { x: last + EDGE, fill: dollars[last] },
  ];

  return (
    <>
      <div
        ref={ref}
        role="img"
        aria-label={`${name} balance at the end of each of the last ${months.length} months, ending at ${price(months[last].balance)} so far this month`}
        className="absolute inset-0"
      >
        {shown && (
          <ComposedChart width={size.width} height={size.height} data={rows} margin={MARGIN}>
            <CartesianGrid
              vertical={false}
              stroke="var(--color-grid)"
              horizontalValues={ticks.filter((tick) => tick !== 0)}
            />
            <XAxis
              type="number"
              dataKey="x"
              domain={[-EDGE, last + EDGE]}
              ticks={months.map((_month, index) => index)}
              tickFormatter={(index: number) => months[index]?.label ?? ""}
              mirror
              axisLine={false}
              tickLine={false}
              tick={{ ...AXIS_TEXT, fill: bottom < 0 ? "var(--color-ink)" : ON_FILL }}
              interval={0}
            />
            <YAxis
              orientation="right"
              domain={[bottom, top]}
              ticks={ticks}
              mirror
              axisLine={false}
              tickLine={false}
              tick={{ ...AXIS_TEXT, fill: "var(--color-ink)" }}
              tickFormatter={(value: number) => shortMoney(value)}
              tickMargin={12}
              allowDataOverflow
            />
            <Tooltip content={<Tip />} cursor={{ stroke: "var(--color-ink)", strokeWidth: 1 }} />
            <Area
              type="linear"
              dataKey="fill"
              fill="var(--color-sea-green)"
              fillOpacity={1}
              stroke="none"
              baseValue={0}
              activeDot={false}
            />
            {bottom < 0 && <ReferenceLine y={0} stroke="var(--color-ink)" strokeWidth={1} data-testid="zero-line" />}
            <Line
              type="linear"
              dataKey="solid"
              stroke="var(--color-ink)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
            <Line
              type="linear"
              dataKey="dashed"
              stroke="var(--color-ink)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={<EndDot />}
              activeDot={false}
            />
          </ComposedChart>
        )}
      </div>
      <table className="sr-only">
        <caption>{name} balance at the end of each month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Balance</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.month}>
              <th scope="row">{month.label}</th>
              <td>{price(month.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
