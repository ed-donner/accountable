import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";

import { AXIS_TEXT as CHART_AXIS_TEXT, niceTop } from "../../components/charts/axes";
import { ChartTooltip } from "../../components/charts/ChartTooltip";
import { useSize } from "../../components/charts/useSize";
import { money, shortMoney } from "../../lib/money";
import type { Dashboard } from "../queries";
import { MONEY_LABEL, REVENUE_MARGIN, moneyLabelOnFill, revenueEdges, revenueY } from "./geometry";
import { MonthsTable } from "./MonthsTable";

const AXIS_TEXT = { ...CHART_AXIS_TEXT, fontWeight: 500 };
// Text on the Sea Green fill is Midnight in both modes, because Sea Mist can't be read on it.
const ON_FILL = "var(--color-midnight)";
const MONTH_TEXT = { ...AXIS_TEXT, fill: ON_FILL };

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

type TickProps = { x?: number; y?: number; payload?: { value: number }; fillTop: number };

function MoneyTick({ x = 0, y = 0, payload, fillTop }: TickProps) {
  const fill = moneyLabelOnFill(y, fillTop) ? ON_FILL : "var(--color-ink)";
  return (
    <text x={x + 6} y={y - MONEY_LABEL.rise} textAnchor="end" style={{ ...AXIS_TEXT, fill }}>
      {shortMoney(payload?.value ?? 0)}
    </text>
  );
}

type DotProps = { cx?: number; cy?: number; payload?: Row };

function EndDot({ cx, cy, payload }: DotProps) {
  if (!payload?.current || cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={5} fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth={2} />;
}

export function RevenueChart({ months }: { months: Dashboard["months"] }) {
  const { ref, size } = useSize();
  const top = niceTop(Math.max(...months.map((month) => month.revenue)));
  const last = months.length - 1;
  const shown =
    size.width > REVENUE_MARGIN.left + REVENUE_MARGIN.right && size.height > REVENUE_MARGIN.top + REVENUE_MARGIN.bottom;
  const edges = revenueEdges(size.width, size.height, months.length, top);
  const fillTop = revenueY(months[last].revenue, size.height, top, edges.bottom);

  const rows: Row[] = [
    { x: edges.left, fill: months[0].revenue },
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
    { x: edges.right, fill: months[last].revenue },
  ];

  return (
    <>
      <div
        ref={ref}
        role="img"
        aria-label={`Revenue won per month for the last 12 months, ending at ${money(months[last].revenue)} so far this month`}
        className="absolute inset-0"
      >
        {shown && (
          <ComposedChart
            width={size.width}
            height={size.height}
            data={rows}
            margin={{ top: REVENUE_MARGIN.top, right: 0, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              x={REVENUE_MARGIN.left}
              width={size.width - REVENUE_MARGIN.left}
              vertical={false}
              stroke="var(--color-grid)"
              horizontalValues={[0.25, 0.5, 0.75, 1].map((share) => top * share)}
            />
            <XAxis
              type="number"
              dataKey="x"
              domain={[edges.left, edges.right]}
              ticks={months.map((_month, index) => index)}
              tickFormatter={(index: number) => months[index]?.label ?? ""}
              mirror
              axisLine={false}
              tickLine={false}
              tick={MONTH_TEXT}
              interval={0}
            />
            <YAxis
              orientation="right"
              domain={[edges.bottom, top]}
              ticks={[0.25, 0.5, 0.75, 1].map((share) => top * share)}
              mirror
              axisLine={false}
              tickLine={false}
              tick={<MoneyTick fillTop={fillTop} />}
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
              baseValue={edges.bottom}
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
        )}
      </div>
      <MonthsTable months={months} caption="Revenue and deals won per month" />
    </>
  );
}
