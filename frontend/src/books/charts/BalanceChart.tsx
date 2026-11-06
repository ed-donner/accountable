import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { AXIS_TEXT as CHART_AXIS_TEXT, niceTop } from "../../components/charts/axes";
import { ChartTooltip } from "../../components/charts/ChartTooltip";
import { useSize } from "../../components/charts/useSize";
import { price, shortMoney } from "../../lib/money";
import type { AccountMonth } from "../queries";

const AXIS_TEXT = { ...CHART_AXIS_TEXT, fontWeight: 500 };
/** The band under the chart that holds the month names. */
const MONTH_BAND = 24;
const MARGIN = { top: 24, right: 0, bottom: 0, left: 0 };
/** The fill runs half a month before the first, and a month and a half past the last, so the money axis on the right has room beside the end dot. */
const EDGE = { left: 0.5, right: 1.5 };

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
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth={2} />
      <text x={cx} y={cy - 12} textAnchor="middle" style={INK}>
        so far
      </text>
    </g>
  );
}

type TickProps = { x?: number | string; y?: number | string; payload?: { value: number | string } };

const INK = { ...AXIS_TEXT, fill: "var(--color-ink)" };
// Text on the Sea Green fill is Midnight in both modes, because Sea Mist can't be read on it.
const ON_FILL = { ...AXIS_TEXT, fill: "var(--color-midnight)" };
/** A money label's baseline stands this far above its grid line, its figures stand this tall, and it keeps this far off the fill's edge. */
const LABEL_BASELINE = 5;
const LABEL_HEIGHT = 9;
const LABEL_GAP = 3;

/**
 * A money label, in Midnight where its middle stands on the fill, which at the right-hand edge reaches from
 * zero to the last balance, and in ink anywhere else. `where` gives how far down the chart a value sits.
 */
function moneyTick(where: (value: number) => number, last: number) {
  const fillEnd = where(last);
  const zero = where(0);
  return function MoneyTick({ x = 0, y = 0, payload }: TickProps) {
    const value = Number(payload?.value ?? 0);
    const baseline = Number(y) - LABEL_BASELINE;
    const middle = baseline - LABEL_HEIGHT / 2;
    // A label that would cross the fill's top edge, where it can't be read, stands just above it instead.
    const crosses = last > 0 && value > 0 && baseline - LABEL_HEIGHT < fillEnd && baseline > fillEnd;
    const onFill =
      last >= 0 ? value > 0 && middle >= fillEnd && !crosses : value < 0 && middle <= fillEnd && middle >= zero;
    return (
      <text
        x={Number(x) + 6}
        y={crosses ? fillEnd - LABEL_GAP : baseline}
        textAnchor="end"
        style={onFill ? ON_FILL : INK}
      >
        {shortMoney(value)}
      </text>
    );
  };
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
  // How far down the plot a value sits, between the margin above and the band of month names below.
  const where = (value: number) =>
    MARGIN.top + ((top - value) / (top - bottom)) * (size.height - MARGIN.top - MONTH_BAND);
  const ticks = bottom < 0 ? [bottom, 0, top] : [0.25, 0.5, 0.75, 1].map((share) => top * share);

  const rows: Row[] = [
    { x: -EDGE.left, fill: dollars[0] },
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
    { x: last + EDGE.right, fill: dollars[last] },
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
              domain={[-EDGE.left, last + EDGE.right]}
              ticks={months.map((_month, index) => index)}
              axisLine={false}
              tickLine={false}
              // The month names stand in a band under the fill, where the line can't cross them.
              height={MONTH_BAND}
              tickFormatter={(index: number) => months[index]?.label ?? ""}
              tick={{ ...AXIS_TEXT, fill: "var(--color-ink)" }}
              interval={0}
            />
            <YAxis
              orientation="right"
              domain={[bottom, top]}
              ticks={ticks}
              mirror
              axisLine={false}
              tickLine={false}
              tick={moneyTick(where, dollars[last])}
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
