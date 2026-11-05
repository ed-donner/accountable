import { Rectangle, type BarShapeProps } from "recharts";

/** The gap in the panel color between two segments of one column, so neighboring colors stay apart. */
export const STACK_GAP = 2;
const RADIUS = 4;

type Props = {
  bar: BarShapeProps;
  fill: string;
  /** Another segment sits below this one. */
  onAnother: boolean;
  /** Nothing sits on this one, so it's the column's rounded top. */
  onTop: boolean;
};

/** One segment of a stacked column, as both Money charts draw them (Visual design, Charts). */
export function StackSegment({ bar, fill, onAnother, onTop }: Props) {
  const height = bar.height - (onAnother ? STACK_GAP : 0);
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
