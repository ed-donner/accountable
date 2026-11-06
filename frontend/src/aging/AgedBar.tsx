import { Bar, BarChart, Rectangle, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";

import { ChartTooltip } from "../components/charts/ChartTooltip";
import { LATE_PARTS, type LatePart } from "../components/charts/lateness";
import { useSize } from "../components/charts/useSize";
import { price } from "../lib/money";
import { plural } from "../lib/words";
import type { AgedRow } from "./queries";

export const BAR = {
  height: 14,
  /** The gap in the panel color between two parts. */
  gap: 2,
  /** The least width of a part with money in it, so it can be seen and pointed at (X11). */
  least: 3,
  radius: 4,
};

type Props = {
  row: AgedRow;
  /** The largest total in the view, in cents: every bar is sized against it (X11). */
  largest: number;
  /** What a part counts: "invoice" or "bill". */
  noun: string;
};

/** A part's width, never less than the least, but nothing for a part with nothing in it. */
function drawnValue(cents: bigint, leastCents: number) {
  const value = Number(cents);
  return value > 0 ? Math.max(value, leastCents) : 0;
}

function corners(first: boolean, last: boolean): [number, number, number, number] {
  return [first ? BAR.radius : 0, last ? BAR.radius : 0, last ? BAR.radius : 0, first ? BAR.radius : 0];
}

/** One part of the bar, with the gap in the panel color after it and 4px rounded ends at the bar's ends. */
function partShape(first: LatePart, last: LatePart, fill: string, part: LatePart) {
  return function PartShape(props: BarShapeProps) {
    const width = Number(props.width ?? 0);
    if (width <= 0) return null;
    const gap = part === last ? 0 : Math.min(BAR.gap, width / 2);
    return (
      <Rectangle
        x={Number(props.x ?? 0)}
        y={Number(props.y ?? 0)}
        width={width - gap}
        height={Number(props.height ?? 0)}
        radius={corners(part === first, part === last)}
        fill={fill}
      />
    );
  };
}

type TipProps = {
  active?: boolean;
  payload?: { dataKey?: string | number }[];
  row: AgedRow;
  noun: string;
};

/** The part pointed at: the organization, the part with its swatch, what's owed in it and how many (X13). */
function Tip({ active, payload, row, noun }: TipProps) {
  const key = payload?.[0]?.dataKey;
  const part = LATE_PARTS.find((late) => late.key === key);
  const sum = row.parts.find((owed) => owed.key === key);
  if (!active || !part || !sum) return null;
  return (
    <ChartTooltip
      value={price(sum.cents)}
      label={
        <>
          <span className="block text-ink">{row.name}</span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: part.color }} />
            {part.label}, {plural(sum.count, noun)}
          </span>
        </>
      }
    />
  );
}

/**
 * One organization's bar: its five parts side by side, Not yet due at the left, each as wide as its
 * amount on a scale shared by the whole view. It draws what the reply says, and the parts are also
 * in the list behind it for a screen reader, where a color alone would say nothing.
 */
export function AgedBar({ row, largest, noun }: Props) {
  const { ref, size } = useSize();
  const leastCents = (BAR.least * Math.max(largest, 1)) / Math.max(size.width, 1);
  const data = [Object.fromEntries(row.parts.map((part) => [part.key, drawnValue(part.cents, leastCents)]))];
  const present = LATE_PARTS.filter((part) => row.parts.some((owed) => owed.key === part.key && owed.cents > 0n));
  const first = present[0]?.key;
  const last = present[present.length - 1]?.key;
  return (
    <div ref={ref} data-testid={`bar-${row.id}`} className="relative" style={{ height: BAR.height }}>
      <ul className="sr-only" aria-label={`${row.name}, by how late`}>
        {present.map((part) => {
          const sum = row.parts.find((owed) => owed.key === part.key)!;
          return (
            <li key={part.key}>
              {part.label}: {price(sum.cents)}, {plural(sum.count, noun)}
            </li>
          );
        })}
      </ul>
      {size.width > 0 && first && last && (
        <BarChart
          aria-hidden="true"
          width={size.width}
          height={BAR.height}
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          accessibilityLayer={false}
        >
          <XAxis type="number" hide domain={[0, Math.max(largest, 1)]} allowDataOverflow />
          <YAxis type="category" hide />
          <Tooltip
            shared={false}
            cursor={false}
            isAnimationActive={false}
            content={<Tip row={row} noun={noun} />}
            wrapperStyle={{ zIndex: 20 }}
          />
          {present.map((part) => (
            <Bar
              key={part.key}
              dataKey={part.key}
              stackId="owed"
              barSize={BAR.height}
              isAnimationActive={false}
              shape={partShape(first, last, part.color, part.key)}
            />
          ))}
        </BarChart>
      )}
    </div>
  );
}
