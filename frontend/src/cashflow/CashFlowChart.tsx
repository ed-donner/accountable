import { format, parseISO } from "date-fns";
import type { RefObject } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Rectangle,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";

import { niceTop } from "../components/charts/axes";
import { ChartTooltip } from "../components/charts/ChartTooltip";
import { MUTED_AXIS_TEXT, centsAxis } from "../components/charts/monthColumns";
import { useSize } from "../components/charts/useSize";
import { price } from "../lib/money";
import { plural } from "../lib/words";
import type { CashFlow, CashMonth } from "./queries";

export const CHART = {
  /** Room above the plot for "Forecast" over the three forecast months. */
  top: 24,
  /** Room under the plot for the lower half of the axis's lowest figure, which sits on the plot's bottom edge. */
  bottom: 8,
  axisWidth: 56,
  columnWidth: 18,
  /** The gap in the panel color between what's moved this month and what's still expected. */
  gap: 2,
  /** The least length of a bar with money in it, its gap included, so it can be seen and pointed at. */
  least: 6,
};

/** The fills, as Visual design's Charts gives them: soft for what's expected. */
export const FILLS = {
  in: "var(--color-sea-green)",
  expectedIn: "var(--color-sea-green-soft)",
  out: "var(--color-coral)",
  expectedOut: "var(--color-coral-soft)",
  band: "var(--color-marigold-soft)",
  line: "var(--color-ink)",
};

/**
 * A month as the chart draws it, in numbers, which are close enough for heights at any size,
 * with the month's exact sums kept for every figure shown. Money out is below zero.
 */
type Column = {
  month: CashMonth;
  in: number;
  expectedIn: number;
  out: number;
  expectedOut: number;
  /** The balance, up to last month's point. */
  solid: number | null;
  /** The balance from last month's point on, through what's expected. */
  dashed: number | null;
  /** From the balance up to the balance with the likely deals, from last month's point on. */
  band: [number, number] | null;
};

function lastPastIndex(months: CashMonth[]) {
  return months.findIndex((month) => month.kind === "current") - 1;
}

function columnsOf(months: CashMonth[], withDeals: boolean, least: (value: number) => number): Column[] {
  const lastPast = lastPastIndex(months);
  return months.map((month, index) => {
    const balance = month.balance === null ? null : Number(month.balance);
    const withLikely = month.balanceWithDeals === null ? null : Number(month.balanceWithDeals);
    return {
      month,
      in: least(Number(month.in)),
      expectedIn: least(Number(month.expectedIn)),
      out: -least(Number(month.out)),
      expectedOut: -least(Number(month.expectedOut)),
      solid: index <= lastPast ? balance : null,
      dashed: index >= lastPast ? balance : null,
      band: withDeals && index >= lastPast && balance !== null && withLikely !== null ? [balance, withLikely] : null,
    };
  });
}

type Scale = { top: number; bottom: number };

/**
 * One money axis for the bars and the line, running below zero for money out and any balance
 * below it. It fits what's shown, so the bars can be read with the switch off, and grows to make
 * room for the likely deals' band when the switch is on, which leaves every figure as it was (Y14).
 */
function scaleOf(columns: Column[]): Scale {
  const values = columns.flatMap((column) => [
    column.in + column.expectedIn,
    column.out + column.expectedOut,
    column.solid ?? 0,
    column.dashed ?? 0,
    ...(column.band ?? []),
  ]);
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const top = niceTop(Math.max(highest, 1));
  const bottom = lowest < 0 ? -niceTop(-lowest) : 0;
  return { top, bottom };
}

/** The least room between two of the axis's figures, which are 12px tall, so 8px clear between them. */
const TICK_ROOM = 20;

/**
 * The axis's figures: $0, then each end, then halfway to each, each only where it has room, so
 * a short run below zero for money out never crowds $0 and the axis never drops its figures itself.
 */
function ticksOf(scale: Scale, plotHeight: number) {
  const y = (value: number) => ((scale.top - value) * plotHeight) / (scale.top - scale.bottom);
  const wanted = [0, scale.bottom, scale.top, scale.top / 2, scale.bottom / 2];
  const kept: number[] = [];
  for (const value of wanted) {
    if (kept.every((other) => Math.abs(y(other) - y(value)) >= TICK_ROOM)) kept.push(value);
  }
  return kept.sort((a, b) => a - b);
}

/** The value a bar's least length stands for at this scale, for a chart this tall. */
function leastValue(scale: Scale, plotHeight: number) {
  return (CHART.least * (scale.top - scale.bottom)) / Math.max(plotHeight, 1);
}

type Part = "in" | "expectedIn" | "out" | "expectedOut";

const PARTS: Record<Part, { rising: boolean; expected: boolean }> = {
  in: { rising: true, expected: false },
  expectedIn: { rising: true, expected: true },
  out: { rising: false, expected: false },
  expectedOut: { rising: false, expected: true },
};

/** A bar's part as a box with its top edge and a length, whichever way Recharts measured it. */
type Box = { x: number; top: number; width: number; length: number };

function boxOf(props: BarShapeProps): Box | null {
  const y = Number(props.y ?? 0);
  const height = Number(props.height ?? 0);
  if (height === 0) return null;
  return {
    x: Number(props.x ?? 0),
    top: Math.min(y, y + height),
    width: Number(props.width ?? 0),
    length: Math.abs(height),
  };
}

/** Leaves the gap on the side nearer the zero line, taking at most half the part, so it never vanishes. */
function afterGap(box: Box, rising: boolean): Box {
  const gap = Math.min(CHART.gap, box.length / 2);
  return { ...box, top: rising ? box.top : box.top + gap, length: box.length - gap };
}

function corners(outermost: boolean, rising: boolean): [number, number, number, number] {
  if (!outermost) return [0, 0, 0, 0];
  return rising ? [4, 4, 0, 0] : [0, 0, 4, 4];
}

/**
 * One part of a month's bar. Money in rises from the zero line and money out drops below it,
 * each with 4px rounded ends away from the line. What's still expected carries on past what's
 * moved, after a 2px gap in the panel color (Visual design, Charts).
 */
function partShape(part: Part, columns: Column[]) {
  const { rising, expected } = PARTS[part];
  return function PartShape(props: BarShapeProps) {
    const column = columns[props.index];
    const drawn = column ? boxOf(props) : null;
    if (!column || !drawn) return null;
    const moved = rising ? column.in : column.out;
    const stillExpected = rising ? column.expectedIn : column.expectedOut;
    const box = expected && moved !== 0 ? afterGap(drawn, rising) : drawn;
    const outermost = expected || stillExpected === 0;
    return (
      <Rectangle
        x={box.x}
        y={box.top}
        width={box.width}
        height={box.length}
        radius={corners(outermost, rising)}
        fill={FILLS[part]}
      />
    );
  };
}

function lastPointDot(lastPast: number) {
  return function LastPoint({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) {
    if (index !== lastPast || cx === undefined || cy === undefined) return null;
    return <circle cx={cx} cy={cy} r={4.5} fill={FILLS.line} stroke="var(--color-panel)" strokeWidth={2} />;
  };
}

function monthName(month: CashMonth) {
  return format(parseISO(`${month.month}-01`), "MMMM");
}

type TipRow = { name: string; count?: string; cents: bigint };

function TipRows({ rows }: { rows: TipRow[] }) {
  return (
    <ul className="mt-1 text-ink">
      {rows.map((row) => (
        <li key={row.name} className="flex items-baseline justify-between gap-4">
          <span>
            {row.name}
            {row.count && <span className="text-muted"> {row.count}</span>}
          </span>
          <span className="num">{price(row.cents)}</span>
        </li>
      ))}
    </ul>
  );
}

function tipRows(month: CashMonth, withDeals: boolean): { title?: string; rows: TipRow[] }[] {
  const moved = [
    { name: "Money in", count: plural(month.inCount, "payment"), cents: month.in },
    { name: "Money out", count: plural(month.outCount, "bill"), cents: month.out },
  ];
  const expected = [
    { name: "Expected in", count: plural(month.expectedInCount, "invoice"), cents: month.expectedIn },
    { name: "Expected out", count: plural(month.expectedOutCount, "bill"), cents: month.expectedOut },
  ];
  const likely =
    withDeals && month.balanceWithDeals !== null
      ? [
          { name: "Likely deals", count: plural(month.likelyCount, "deal"), cents: month.likely },
          { name: "With likely deals", cents: month.balanceWithDeals },
        ]
      : [];
  if (month.kind === "past") return [{ rows: moved }];
  if (month.kind === "forecast") return [{ rows: [...expected, ...likely] }];
  return [
    { title: "So far", rows: moved },
    { title: "Still expected", rows: [...expected, ...likely] },
  ];
}

type TipProps = { active?: boolean; payload?: { payload: Column }[]; withDeals: boolean };

/** The month pointed at: what came in and went out, or what's expected, and its balance at the end (Y17). */
function Tip({ active, payload, withDeals }: TipProps) {
  const month = payload?.[0]?.payload.month;
  if (!active || !month) return null;
  const end = `${month.kind === "past" ? "Cash" : "Expected cash"} at the end of ${monthName(month)}`;
  const groups = tipRows(month, withDeals);
  const details = groups.map((group) => (
    <div key={group.title ?? "rows"}>
      {group.title && <span className="mt-1 block">{group.title}</span>}
      <TipRows rows={group.rows} />
    </div>
  ));
  if (month.balance === null) {
    return (
      <ChartTooltip
        label={
          <>
            {`${monthName(month)} ${month.year}`}
            {details}
          </>
        }
      />
    );
  }
  return (
    <ChartTooltip
      value={price(month.balance)}
      label={
        <>
          <span className="block">{end}</span>
          {details}
        </>
      }
    />
  );
}

type LabelsProps = {
  months: CashMonth[];
  labelRefs: RefObject<Map<string, HTMLButtonElement>>;
  onOpen: (month: CashMonth) => void;
};

/**
 * The months' names under their columns: the first three letters, with the year under the
 * first month and each January, and "so far" under this month. This month's and the forecast's
 * are buttons, which open what's expected in them, so the keyboard reaches them too (Y17).
 */
function MonthLabels({ months, labelRefs, onOpen }: LabelsProps) {
  return (
    <ol
      className="grid h-11 flex-none text-center text-[12px] leading-4"
      style={{ marginRight: CHART.axisWidth, gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
    >
      {months.map((month, index) => {
        const year =
          index === 0 || month.label === "Jan" ? <span className="block text-muted">{month.year}</span> : null;
        const soFar = month.kind === "current" ? <span className="block font-medium text-ink">so far</span> : null;
        const name = <span className="num block">{month.label}</span>;
        return (
          <li key={month.month} className="flex items-start justify-center pt-1.5">
            {month.kind === "past" ? (
              <span className="text-muted">
                {name}
                {year}
              </span>
            ) : (
              <button
                type="button"
                ref={(element) => {
                  if (element) labelRefs.current.set(month.month, element);
                  else labelRefs.current.delete(month.month);
                }}
                aria-label={`${month.kind === "current" ? "Still expected in" : "Expected in"} ${monthName(month)} ${month.year}`}
                className="-mx-1 -mt-0.5 cursor-pointer rounded-control px-1 pt-0.5 text-muted hover:text-ink"
                onClick={() => onOpen(month)}
              >
                {name}
                {soFar}
                {year}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

type Props = {
  flow: CashFlow;
  withDeals: boolean;
  labelRefs: RefObject<Map<string, HTMLButtonElement>>;
  onOpen: (month: CashMonth) => void;
};

/**
 * The money in and out each month, with the cash balance at each month's end, carried on as
 * a forecast for the three months after this one (Y1 to Y14). It draws what the reply says,
 * adding nothing up itself (Y19). Clicking this month's column or a forecast month's opens
 * what's expected in it, as its label does.
 */
export function CashFlowChart({ flow, withDeals, labelRefs, onOpen }: Props) {
  const { ref, size } = useSize();
  const { months } = flow;
  const lastPast = lastPastIndex(months);
  const plotHeight = size.height - CHART.top - CHART.bottom;
  const scale = scaleOf(columnsOf(months, withDeals, (value) => value));
  const least = leastValue(scale, plotHeight);
  const ticks = ticksOf(scale, plotHeight);
  const columns = columnsOf(months, withDeals, (value) => (value > 0 ? Math.max(value, least) : 0));
  const firstForecast = months.findIndex((month) => month.kind === "forecast");

  function openAt(index: number) {
    const month = months[index];
    if (month && month.kind !== "past") onOpen(month);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        role="img"
        aria-label={`Money in and out each month for the last 12 months and the next 3${flow.opening ? ", with the cash balance at each month's end" : ""}`}
        className="relative min-h-0 flex-1"
      >
        {size.width > 0 && size.height > 0 && (
          <>
            <span
              aria-hidden="true"
              className="absolute top-0 -translate-x-1/2 text-[12px] leading-4 text-muted"
              style={{ left: `calc((100% - ${CHART.axisWidth}px) * ${firstForecast + 1.5} / ${months.length})` }}
            >
              Forecast
            </span>
            <ComposedChart
              width={size.width}
              height={size.height}
              data={columns}
              stackOffset="sign"
              margin={{ top: CHART.top, right: 0, bottom: CHART.bottom, left: 0 }}
              onClick={(state) => openAt(Number(state?.activeTooltipIndex))}
              className={months.some((month) => month.kind !== "past") ? "cursor-pointer" : undefined}
            >
              <CartesianGrid vertical={false} stroke="var(--color-grid)" horizontalValues={ticks} />
              <XAxis dataKey="month.month" hide />
              <YAxis
                orientation="right"
                width={CHART.axisWidth}
                domain={[scale.bottom, scale.top]}
                ticks={ticks}
                interval={0}
                tickFormatter={centsAxis}
                axisLine={false}
                tickLine={false}
                tick={MUTED_AXIS_TEXT}
              />
              <Tooltip
                content={<Tip withDeals={withDeals} />}
                cursor={{ fill: "var(--color-page)" }}
                isAnimationActive={false}
              />
              <ReferenceLine y={0} stroke="var(--color-line)" strokeWidth={1} />
              {withDeals && (
                <Area
                  dataKey="band"
                  type="linear"
                  fill={FILLS.band}
                  fillOpacity={1}
                  stroke="none"
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
              {(["in", "expectedIn", "out", "expectedOut"] as const).map((part) => (
                <Bar
                  key={part}
                  dataKey={part}
                  stackId="money"
                  barSize={CHART.columnWidth}
                  isAnimationActive={false}
                  shape={partShape(part, columns)}
                />
              ))}
              <Line
                dataKey="dashed"
                type="linear"
                stroke={FILLS.line}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="solid"
                type="linear"
                stroke={FILLS.line}
                strokeWidth={2}
                dot={lastPointDot(lastPast)}
                activeDot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </>
        )}
      </div>
      <MonthLabels months={months} labelRefs={labelRefs} onOpen={onOpen} />
    </div>
  );
}
