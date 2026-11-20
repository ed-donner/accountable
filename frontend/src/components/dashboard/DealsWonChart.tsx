import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel, PanelTitle } from "@/components/states";
import { dealsWonSummary } from "@/lib/dashboard";
import { plural } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";
import { ChartTotal, MonthTooltip } from "./chartParts";
import { AXIS_TICK, GRID, type MonthRow } from "./chartStyle";

const MARIGOLD = "#FFC145";

/** The number of deals won in each of the same 12 months (DASH-4): Marigold bars with rounded tops, each labeled with its count. */
export function DealsWonChart({ months }: { months: MonthRow[] }) {
  const reducedMotion = useReducedMotion();
  const total = months.reduce((sum, m) => sum + m.deals, 0);

  return (
    <Panel aria-labelledby="deals-won-title">
      <PanelTitle hint="Last 12 months" id="deals-won-title">
        Deals won
      </PanelTitle>
      <ChartTotal value={String(total)}>{total === 1 ? "deal" : "deals"} won in the last 12 months</ChartTotal>
      <p className="sr-only">{dealsWonSummary(months)}</p>
      <div className="h-[250px]" data-chart="deals-won">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} margin={{ top: 22, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" interval={0} tickLine={false} axisLine={false} tick={AXIS_TICK} tickMargin={10} />
            <YAxis
              allowDecimals={false}
              // Room above the tallest bar for its count.
              domain={[0, (max: number) => Math.max(1, max + 1)]}
              width={36}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickMargin={6}
            />
            <Tooltip
              content={(props) => <MonthTooltip {...props} figure={(row) => `${plural(row.deals, "deal")} won`} />}
              cursor={{ fill: "#F0F4F5" }}
              isAnimationActive={false}
            />
            <Bar
              dataKey="deals"
              name="Deals won"
              fill={MARIGOLD}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={!reducedMotion}
              animationDuration={400}
            >
              <LabelList
                dataKey="deals"
                position="top"
                offset={6}
                formatter={(value) => (Number(value) > 0 ? String(value) : "")}
                style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 500, fill: "#073B4C" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
