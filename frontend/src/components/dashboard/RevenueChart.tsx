import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel, PanelTitle } from "@/components/states";
import { niceTicks, revenueSummary } from "@/lib/dashboard";
import { money, shortMoney } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";
import { ChartTotal, MonthTooltip } from "./chartParts";
import { AXIS_TICK, GRID, type MonthRow } from "./chartStyle";

const LINE = "#05A87E";
const FILL = "#06D6A0";

/**
 * Revenue won in each of the last 12 months (DASH-3): a 2.5px line in the
 * deeper Sea Green, a flat 14% fill under it, and a dot on the latest month.
 */
export function RevenueChart({ months }: { months: MonthRow[] }) {
  const reducedMotion = useReducedMotion();
  const total = months.reduce((sum, m) => sum + m.revenue, 0);
  const last = months.length - 1;
  // Round steps, such as $0, $50k, $100k and $150k; an empty year still gets a scale.
  const ticks = niceTicks(Math.max(...months.map((m) => m.revenue), 40_000));

  return (
    <Panel aria-labelledby="revenue-title">
      <PanelTitle hint="Last 12 months" id="revenue-title">
        Revenue won
      </PanelTitle>
      <ChartTotal value={money(total)}>won in the last 12 months</ChartTotal>
      <p className="sr-only">{revenueSummary(months)}</p>
      {/* A fixed height, so the chart never measures zero. */}
      <div className="h-[250px]" data-chart="revenue">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={months} margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            {/* A band scale puts each month's point in the middle of its month, in line with the bars beside it. */}
            <XAxis
              dataKey="label"
              scale="band"
              interval={0}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickMargin={10}
            />
            <YAxis
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]]}
              tickFormatter={shortMoney}
              width={60}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickMargin={6}
            />
            <Tooltip
              content={(props) => <MonthTooltip {...props} figure={(row) => `${money(row.revenue)} won`} />}
              cursor={{ stroke: "#B9C9CE", strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Area
              type="linear"
              dataKey="revenue"
              name="Revenue won"
              stroke={LINE}
              strokeWidth={2.5}
              fill={FILL}
              fillOpacity={0.14}
              isAnimationActive={!reducedMotion}
              animationDuration={400}
              dot={(props) =>
                props.index === last ? (
                  <circle
                    key="latest"
                    cx={props.cx}
                    cy={props.cy}
                    r={4.5}
                    fill={LINE}
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                ) : (
                  <g key={props.index} />
                )
              }
              activeDot={{ r: 5, fill: LINE, stroke: "#FFFFFF", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
