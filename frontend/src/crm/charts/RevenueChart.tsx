import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { money, shortMoney } from "../../lib/money";
import type { Dashboard } from "../queries";
import { ChartTooltip } from "./ChartTooltip";
import { MonthsTable } from "./MonthsTable";

// The fill runs to the panel's edges, past the first and last months.
const LEFT_EDGE = -0.45;
const RIGHT_EDGE = 11.8;
// The fill also runs below zero, to the panel's bottom edge, under the month labels.
const BELOW_ZERO = 0.1;
const AXIS_TEXT = { fill: "var(--color-ink)", fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500 };

function niceTop(value: number) {
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * power;
}

type Row = {
  x: number;
  fill: number;
  solid?: number;
  dashed?: number;
  label?: string;
  revenue?: number;
  current?: boolean;
};

type TipProps = { active?: boolean; payload?: { payload: Row }[] };

function Tip({ active, payload }: TipProps) {
  const row = payload?.[0]?.payload;
  if (!active || row?.revenue === undefined) return null;
  return <ChartTooltip value={money(row.revenue)} label={row.current ? `${row.label} so far` : row.label} />;
}

type TickProps = { x?: number; y?: number; payload?: { value: number } };

function MoneyTick({ x = 0, y = 0, payload }: TickProps) {
  return (
    <text x={x + 6} y={y - 5} textAnchor="end" style={AXIS_TEXT}>
      {shortMoney(payload?.value ?? 0)}
    </text>
  );
}

type DotProps = { cx?: number; cy?: number; payload?: Row };

function EndDot({ cx, cy, payload }: DotProps) {
  if (!payload?.current || cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={5} fill="var(--color-ink)" stroke="#fff" strokeWidth={2} />;
}

export function RevenueChart({ months }: { months: Dashboard["months"] }) {
  const top = niceTop(Math.max(...months.map((month) => month.revenue)));
  const last = months.length - 1;

  const rows: Row[] = [
    { x: LEFT_EDGE, fill: months[0].revenue },
    ...months.map((month, index) => ({
      x: index,
      fill: month.revenue,
      // The current month isn't finished, so its segment is dashed and can't read as a fall.
      solid: index < last ? month.revenue : undefined,
      dashed: index >= last - 1 ? month.revenue : undefined,
      label: month.label,
      revenue: month.revenue,
      current: index === last,
    })),
    { x: RIGHT_EDGE, fill: months[last].revenue },
  ];

  return (
    <>
      <div
        role="img"
        aria-label={`Revenue won per month for the last 12 months, ending at ${money(months[last].revenue)} so far this month`}
        className="absolute inset-0"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 30, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid
              vertical={false}
              stroke="var(--color-grid)"
              horizontalValues={[0.25, 0.5, 0.75, 1].map((share) => top * share)}
            />
            <XAxis
              type="number"
              dataKey="x"
              domain={[LEFT_EDGE, RIGHT_EDGE]}
              ticks={months.map((_month, index) => index)}
              tickFormatter={(index: number) => months[index]?.label ?? ""}
              mirror
              axisLine={false}
              tickLine={false}
              tick={AXIS_TEXT}
              interval={0}
            />
            <YAxis
              orientation="right"
              domain={[-top * BELOW_ZERO, top]}
              ticks={[0.25, 0.5, 0.75, 1].map((share) => top * share)}
              mirror
              axisLine={false}
              tickLine={false}
              tick={<MoneyTick />}
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
              baseValue={-top * BELOW_ZERO}
              activeDot={false}
            />
            <Line
              type="linear"
              dataKey="solid"
              stroke="var(--color-ink)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              connectNulls={false}
            />
            <Line
              type="linear"
              dataKey="dashed"
              stroke="var(--color-ink)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={<EndDot />}
              activeDot={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <MonthsTable months={months} caption="Revenue and deals won per month" />
    </>
  );
}
