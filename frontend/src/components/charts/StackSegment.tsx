import { Rectangle, type BarShapeProps } from "recharts";

import { niceTop } from "./axes";

/** The gap in the panel color between two segments of one column, so neighboring colors stay apart. */
export const STACK_GAP = 2;
const RADIUS = 4;
/** The least height of a segment with money in it, its gap included, so it can be seen and pointed at. */
export const LEAST_HEIGHT = 4 + STACK_GAP;
/** Enough for the top to settle. If it hasn't, the stacks run a little past it and the axis stretches to fit. */
const ROUNDS = 8;

export type StackScale = {
  /** The axis top, a round step, with room for every stack as drawn. */
  top: number;
  /** The value to stack a segment at: its own, or the least height's worth if that's more. */
  drawn: (value: number) => number;
};

/**
 * The scale for columns stacked from these values, one list a column. A segment too small
 * to see, such as a $49 bill on a $4,500 one, is stacked at the least height's worth instead,
 * so it still shows and can be pointed at, which still tells its real value. Each column
 * grows by those few pixels, so the top makes room for them. Where a column has too many
 * segments for the least height to fit in half the chart, they share that half.
 */
export function stackScale(columns: number[][], plotHeight: number): StackScale {
  const most = Math.max(1, ...columns.map((values) => values.filter((value) => value > 0).length));
  const least = Math.min(LEAST_HEIGHT, plotHeight / (2 * most));
  const drawnUnder = (top: number) => {
    const smallest = (least * top) / plotHeight;
    return (value: number) => (value > 0 ? Math.max(value, smallest) : 0);
  };
  const tallest = (drawn: (value: number) => number) =>
    Math.max(...columns.map((values) => values.reduce((sum, value) => sum + drawn(value), 0)));

  let top = niceTop(tallest((value) => value));
  for (let round = 0; round < ROUNDS; round++) {
    const needed = niceTop(tallest(drawnUnder(top)));
    if (needed <= top) break;
    top = needed;
  }
  return { top, drawn: drawnUnder(top) };
}

type Props = {
  bar: BarShapeProps;
  fill: string;
  /** Another segment sits below this one. */
  onAnother: boolean;
  /** Nothing sits on this one, so it's the column's rounded top. */
  onTop: boolean;
};

/**
 * One segment of a stacked column, as both Money charts draw them (Visual design, Charts).
 * The gap under it takes at most half of it, so a segment with money in it never vanishes.
 */
export function StackSegment({ bar, fill, onAnother, onTop }: Props) {
  const gap = onAnother ? Math.min(STACK_GAP, bar.height / 2) : 0;
  const height = bar.height - gap;
  if (height <= 0) return null;
  return (
    <Rectangle
      x={bar.x}
      y={bar.y}
      width={bar.width}
      height={height}
      radius={onTop ? [RADIUS, RADIUS, 0, 0] : 0}
      fill={fill}
    />
  );
}
