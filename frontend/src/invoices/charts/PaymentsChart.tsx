import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";

import { AXIS_TEXT as CHART_AXIS_TEXT, niceTop } from "../../components/charts/axes";
import { ChartTooltip } from "../../components/charts/ChartTooltip";
import { useSize } from "../../components/charts/useSize";
import { price, shortMoney } from "../../lib/money";
import { plural } from "../../lib/words";
import type { Money } from "../queries";

const AXIS_TEXT = { ...CHART_AXIS_TEXT, fill: "var(--color-muted)" };
const MARGIN = { top: 32, right: 6, bottom: 24, left: 44 };

type Month = Money["payments"][number] & { dollars: number };

type TipProps = { active?: boolean; payload?: { payload: Month }[]; last: string };

function Tip({ active, payload, last }: TipProps) {
  const month = payload?.[0]?.payload;
  if (!active || !month) return null;
  const label = `${plural(month.count, "payment")}, ${month.label}${month.month === last ? " so far" : ""}`;
  return <ChartTooltip value={price(BigInt(month.cents))} label={label} />;
}

type LabelProps = { y?: number | string; index?: number };

/** The payments received in each of the last 12 months, as the deals-won bars, with a money axis (V29). */
export function PaymentsChart({ months }: { months: Money["payments"] }) {
  const { ref, size } = useSize();
  const last = months.length - 1;
  // Near enough for a bar's height, however large. The tooltip's figure is exact.
  const data: Month[] = months.map((month) => ({ ...month, dollars: Number(month.cents) / 100 }));
  const top = niceTop(Math.max(...data.map((month) => month.dollars), 1));
  const ticks = [top / 2, top];

  function soFar({ y = 0, index }: LabelProps) {
    if (index !== last) return null;
    return (
      <text
        x={size.width - MARGIN.right}
        y={Number(y) - 10}
        textAnchor="end"
        style={{ ...AXIS_TEXT, fill: "var(--color-ink)", fontWeight: 500 }}
      >
        so far
      </text>
    );
  }

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Payments received each month for the last 12 months, with ${price(BigInt(months[last].cents))} so far this month`}
      className="min-h-0 flex-1"
    >
      {size.width > 0 && size.height > 0 && (
        <BarChart
          width={size.width}
          height={size.height}
          data={data}
          margin={{ top: MARGIN.top, right: MARGIN.right, bottom: 0, left: 0 }}
          barCategoryGap="20%"
        >
          <CartesianGrid vertical={false} stroke="var(--color-grid)" horizontalValues={ticks} />
          <XAxis
            dataKey="label"
            ticks={data.filter((_month, index) => (last - index) % 2 === 0).map((month) => month.label)}
            interval={0}
            axisLine={false}
            tickLine={false}
            tick={AXIS_TEXT}
            height={MARGIN.bottom}
          />
          <YAxis
            width={MARGIN.left}
            domain={[0, top]}
            ticks={ticks}
            tickFormatter={shortMoney}
            axisLine={false}
            tickLine={false}
            tick={AXIS_TEXT}
          />
          <Tooltip content={<Tip last={months[last].month} />} cursor={{ fill: "var(--color-page)" }} />
          <Bar
            dataKey="dollars"
            barSize={13}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            shape={(props: BarShapeProps) => (
              <Rectangle {...props} fill={props.index === last ? "var(--color-bar-soft)" : "var(--color-ink)"} />
            )}
          >
            <LabelList dataKey="dollars" content={soFar} />
          </Bar>
        </BarChart>
      )}
    </div>
  );
}
