import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";

import { ChartTooltip } from "../components/charts/ChartTooltip";
import { MONTH_CHART, MUTED_AXIS_TEXT, centsAxis } from "../components/charts/monthColumns";
import { LEAST_HEIGHT, StackSegment } from "../components/charts/StackSegment";
import { useSize } from "../components/charts/useSize";
import { formatDate } from "../lib/dates";
import { price } from "../lib/money";
import { totals as totalsOf, type Figure } from "./balance";

/** The bars' height, the plot's, without the room above and the names below (Screens). */
const BAR_HEIGHT = 220;
const BAR_WIDTH = 120;
const NAMES_HEIGHT = 28;
const ROOM_ABOVE = 8;

/** The whole chart's height: the bars, the room above them and their names below. */
export const CHART_HEIGHT = BAR_HEIGHT + ROOM_ABOVE + NAMES_HEIGHT;

const SIDES = { left: "What the business owns", right: "What it owes and what's the owner's" } as const;
const NAME_TEXT = { fontSize: 13, fontFamily: "var(--font-sans)", fill: "var(--color-ink)" };

/** A side as the chart draws it: the numbers for heights, which are close enough at any size, and the exact figures kept. */
type Column = { side: Figure["side"]; name: string } & Record<string, number | string>;

function columnsOf(figures: Figure[]): Column[] {
  return (["left", "right"] as const).map((side) => ({
    side,
    name: SIDES[side],
    ...Object.fromEntries(
      figures.map((figure) => [figure.id, figure.side === side ? Math.max(0, Number(figure.cents)) : 0]),
    ),
  }));
}

/**
 * What each account stacks at: its own value, or the least height's worth if it is too small to see, with
 * what that adds taken off the bar's largest segment, so a bar keeps its real height and two balanced sides
 * stay the same height.
 */
function heightsOf(column: Column, figures: Figure[], drawn: (value: number) => number): Record<string, number> {
  const real = figures.map((figure) => Number(column[figure.id]));
  const stacked = real.map(drawn);
  const extra = stacked.reduce((sum, value) => sum + value, 0) - real.reduce((sum, value) => sum + value, 0);
  const largest = real.indexOf(Math.max(...real));
  if (extra > 0 && largest >= 0) stacked[largest] = Math.max(real[largest] - extra, 0);
  return Object.fromEntries(figures.map((figure, place) => [figure.id, stacked[place]]));
}

type TipProps = { active?: boolean; payload?: { name?: string | number }[]; figures: Figure[]; day: string };

/** The segment pointed at: its account's name, its real figure and the day. */
export function SegmentTip({ active, payload, figures, day }: TipProps) {
  const figure = figures.find((each) => each.name === payload?.[0]?.name);
  if (!active || !figure) return null;
  return <ChartTooltip value={price(figure.cents)} label={`${figure.name} on ${formatDate(day)}`} />;
}

/** Every figure, for anyone who can't see the chart. */
function FiguresTable({ figures, day }: { figures: Figure[]; day: string }) {
  const { left, right } = totalsOf(figures);
  return (
    <table className="sr-only">
      <caption>Balance sheet on {formatDate(day)}</caption>
      <thead>
        <tr>
          <th scope="col">Account</th>
          <th scope="col">Side</th>
          <th scope="col">Balance</th>
        </tr>
      </thead>
      <tbody>
        {figures.map((figure) => (
          <tr key={figure.id}>
            <th scope="row">{figure.name}</th>
            <td>{SIDES[figure.side]}</td>
            <td>{price(figure.cents)}</td>
          </tr>
        ))}
        <tr>
          <th scope="row">Total</th>
          <td>{SIDES.left}</td>
          <td>{price(left)}</td>
        </tr>
        <tr>
          <th scope="row">Total</th>
          <td>{SIDES.right}</td>
          <td>{price(right)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Two stacked bars, one for each side, on one scale from $0 to the larger side, so when the
 * books balance they are the same height (X7). Each account is a segment in its own color, in the
 * columns' order from the bottom up, and one at zero or below has none.
 */
export function BalanceBars({ figures, day }: { figures: Figure[]; day: string }) {
  const { ref, size } = useSize();
  const columns = columnsOf(figures);
  const plotHeight = size.height - ROOM_ABOVE - NAMES_HEIGHT;
  const empty = columns.every((column) => figures.every((figure) => column[figure.id] === 0));
  // The scale runs from $0 to the larger side's total, not a round step above it, so balanced bars fill the chart (X7).
  const sums = columns.map((column) => figures.reduce((sum, figure) => sum + Number(column[figure.id]), 0));
  const top = Math.max(1, ...sums);
  const leastValue = (LEAST_HEIGHT * top) / Math.max(plotHeight, 1);
  const drawn = (value: number) => (value > 0 ? Math.max(value, leastValue) : 0);

  const heights = Object.fromEntries(columns.map((column) => [column.side, heightsOf(column, figures, drawn)]));

  function shapeFor(place: number) {
    return function Segment(bar: BarShapeProps) {
      const column = bar.payload as Column;
      const has = (figure: Figure) => Number(column[figure.id]) > 0;
      return (
        <StackSegment
          bar={bar}
          fill={figures[place].fill}
          onAnother={figures.slice(0, place).some(has)}
          onTop={!figures.slice(place + 1).some(has)}
        />
      );
    };
  }

  return (
    <>
      <div
        ref={ref}
        role="img"
        aria-label={`The two sides of the balance sheet on ${formatDate(day)}`}
        style={{ height: CHART_HEIGHT }}
        className="relative"
      >
        {empty ? (
          <p className="absolute inset-0 flex items-center justify-center text-muted">
            Nothing in the books by this date.
          </p>
        ) : (
          size.width > 0 &&
          size.height > 0 && (
            <BarChart
              width={size.width}
              height={size.height}
              data={columns}
              margin={{ top: ROOM_ABOVE, right: 0, bottom: 0, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--color-grid)" horizontalValues={[0, top / 2, top]} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={NAME_TEXT}
                height={NAMES_HEIGHT}
                interval={0}
              />
              <YAxis
                orientation="right"
                width={MONTH_CHART.axisWidth}
                domain={[0, top]}
                ticks={[0, top / 2, top]}
                tickFormatter={centsAxis}
                axisLine={false}
                tickLine={false}
                tick={MUTED_AXIS_TEXT}
              />
              <Tooltip shared={false} content={<SegmentTip figures={figures} day={day} />} cursor={false} />
              {figures.map((figure, place) => (
                <Bar
                  key={figure.id}
                  name={figure.name}
                  dataKey={(column: Column) => heights[column.side][figure.id]}
                  stackId="sides"
                  barSize={BAR_WIDTH}
                  isAnimationActive={false}
                  shape={shapeFor(place)}
                />
              ))}
            </BarChart>
          )
        )}
      </div>
      <FiguresTable figures={figures} day={day} />
    </>
  );
}
