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

import { niceTop } from "../../components/charts/axes";
import { ChartTooltip } from "../../components/charts/ChartTooltip";
import { MONTH_CHART, MUTED_AXIS_TEXT, centsAxis, soFarOver } from "../../components/charts/monthColumns";
import { useSize } from "../../components/charts/useSize";
import { price } from "../../lib/money";
import { plural } from "../../lib/words";
import type { Money } from "../queries";

type Month = Money["payments"][number];

type TipProps = { active?: boolean; payload?: { payload: Month }[]; last: string };

function Tip({ active, payload, last }: TipProps) {
  const month = payload?.[0]?.payload;
  if (!active || !month) return null;
  const label = `${plural(month.count, "payment")}, ${month.label}${month.month === last ? " so far" : ""}`;
  return <ChartTooltip value={price(month.cents)} label={label} />;
}

/**
 * The payments received in each of the last 12 months, in ink with this month in the soft bar
 * color, laid out as the spending chart beside it is (V29).
 */
export function PaymentsChart({ months }: { months: Money["payments"] }) {
  const { ref, size } = useSize();
  const last = months.length - 1;
  const top = niceTop(Math.max(...months.map((month) => month.cents), 1));
  const ticks = [top / 2, top];

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Payments received each month for the last 12 months, with ${price(months[last].cents)} so far this month`}
      className="min-h-0 flex-1"
    >
      {size.width > 0 && size.height > 0 && (
        <BarChart
          width={size.width}
          height={size.height}
          data={months}
          margin={{ top: MONTH_CHART.top, right: 0, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-grid)" horizontalValues={ticks} />
          <XAxis
            dataKey="label"
            interval={0}
            axisLine={false}
            tickLine={false}
            tick={MUTED_AXIS_TEXT}
            height={MONTH_CHART.monthsHeight}
          />
          <YAxis
            orientation="right"
            width={MONTH_CHART.axisWidth}
            domain={[0, top]}
            ticks={ticks}
            tickFormatter={centsAxis}
            axisLine={false}
            tickLine={false}
            tick={MUTED_AXIS_TEXT}
          />
          <Tooltip content={<Tip last={months[last].month} />} cursor={{ fill: "var(--color-page)" }} />
          <Bar
            dataKey="cents"
            barSize={MONTH_CHART.columnWidth}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            shape={(props: BarShapeProps) => (
              <Rectangle {...props} fill={props.index === last ? "var(--color-bar-soft)" : "var(--color-ink)"} />
            )}
          >
            <LabelList dataKey="cents" content={soFarOver(last)} />
          </Bar>
        </BarChart>
      )}
    </div>
  );
}
