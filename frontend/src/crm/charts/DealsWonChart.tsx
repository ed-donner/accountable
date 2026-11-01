import { Bar, BarChart, CartesianGrid, LabelList, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";

import { plural } from "../../lib/words";
import type { Dashboard } from "../queries";
import { ChartTooltip } from "./ChartTooltip";

const AXIS_TEXT = { fill: "var(--color-muted)", fontSize: 12, fontFamily: "var(--font-mono)" };

type Month = Dashboard["months"][number];

/** Whole-number steps, three at most, with the top one at or above the tallest bar. */
function steps(highest: number): number[] {
  const step = Math.max(1, Math.ceil(highest / 3));
  const ticks = [];
  for (let tick = step; tick < highest + step; tick += step) ticks.push(tick);
  return ticks;
}

type TipProps = { active?: boolean; payload?: { payload: Month }[]; months: Dashboard["months"] };

function Tip({ active, payload, months }: TipProps) {
  const month = payload?.[0]?.payload;
  if (!active || !month) return null;
  const current = month.month === months[months.length - 1].month;
  return <ChartTooltip value={plural(month.deals, "deal")} label={current ? `${month.label} so far` : month.label} />;
}

type LabelProps = { x?: number | string; y?: number | string; width?: number | string; index?: number };

export function DealsWonChart({ months }: { months: Dashboard["months"] }) {
  const last = months.length - 1;
  const ticks = steps(Math.max(...months.map((month) => month.deals)));

  function soFar({ x = 0, y = 0, width = 0, index }: LabelProps) {
    if (index !== last) return null;
    return (
      <text
        x={Number(x) + Number(width)}
        y={Number(y) - 8}
        textAnchor="end"
        style={{ ...AXIS_TEXT, fill: "var(--color-ink)", fontWeight: 500 }}
      >
        so far
      </text>
    );
  }

  return (
    <div
      role="img"
      aria-label={`Deals won per month for the last 12 months, with ${months[last].deals} so far this month`}
      className="min-h-0 flex-1"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={months} margin={{ top: 28, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--color-grid)" horizontalValues={ticks} />
          <XAxis
            dataKey="label"
            ticks={months.filter((_month, index) => (last - index) % 2 === 0).map((month) => month.label)}
            interval={0}
            axisLine={false}
            tickLine={false}
            tick={AXIS_TEXT}
            height={22}
          />
          <YAxis
            width={22}
            domain={[0, ticks[ticks.length - 1]]}
            ticks={ticks}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={AXIS_TEXT}
          />
          <Tooltip content={<Tip months={months} />} cursor={{ fill: "var(--color-page)" }} />
          <Bar
            dataKey="deals"
            barSize={13}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            shape={(props: BarShapeProps) => (
              <Rectangle {...props} fill={props.index === last ? "var(--color-bar-soft)" : "var(--color-ink)"} />
            )}
          >
            <LabelList dataKey="deals" content={soFar} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
