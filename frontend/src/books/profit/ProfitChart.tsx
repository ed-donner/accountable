import { format, parseISO } from "date-fns";
import {
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

import { niceTop } from "../../components/charts/axes";
import { CATEGORIES, CategoryLabel, Swatch, type Category } from "../../components/charts/categories";
import { ChartTooltip } from "../../components/charts/ChartTooltip";
import { MUTED_AXIS_TEXT, centsAxis } from "../../components/charts/monthColumns";
import { StackSegment, stackScale } from "../../components/charts/StackSegment";
import { useSize } from "../../components/charts/useSize";
import { sum } from "./figures";
import type { ChartMonth, Figure, Target } from "./queries";
import { registerKey } from "./Statement";

export const CHART = {
  top: 12,
  bottom: 8,
  axisWidth: 52,
  columnWidth: 12,
  /** The space between a month's revenue column and its expenses column. */
  gap: 2,
};

export const FILLS = {
  revenue: "var(--color-ink)",
  profit: "var(--color-ink)",
  casing: "var(--color-panel)",
};

/** A month as the chart draws it, in numbers, which are close enough for heights, with its exact sums kept. */
type Column = { month: ChartMonth; revenue: number; profit: number; spent: Record<Category, number> };

function columnsOf(months: ChartMonth[]): Column[] {
  return months.map((month) => ({
    month,
    revenue: Math.max(0, Number(month.revenue_cents)),
    profit: Number(month.profit_cents),
    spent: Object.fromEntries(month.categories.map((each) => [each.category, Number(each.cents)])) as Record<
      Category,
      number
    >,
  }));
}

/** The least room between two of the axis's figures, which are 12px tall. */
const TICK_ROOM = 20;

/** $0, then each end, then halfway to each, each only where it has room. */
function ticksOf(top: number, bottom: number, plotHeight: number) {
  const y = (value: number) => ((top - value) * plotHeight) / (top - bottom);
  const kept: number[] = [];
  for (const value of [0, bottom, top, top / 2, bottom / 2]) {
    if (kept.every((other) => Math.abs(y(other) - y(value)) >= TICK_ROOM)) kept.push(value);
  }
  return kept.sort((a, b) => a - b);
}

/** The month's name, such as "March 2026". */
export function monthTitle(month: ChartMonth) {
  return format(parseISO(month.first), "MMMM yyyy");
}

function targetOf(month: ChartMonth, figure: Figure, name: string): Target {
  return { figure, name, periodLabel: monthTitle(month), from: month.first, to: month.last };
}

export function nothingYet(months: ChartMonth[]) {
  return months.every((month) => BigInt(month.revenue_cents) === 0n && BigInt(month.expenses_cents) === 0n);
}

type TipProps = { active?: boolean; payload?: { payload: Column }[] };

/** The month pointed at: revenue, each category with money, total expenses and the profit (X10). */
function Tip({ active, payload }: TipProps) {
  const month = payload?.[0]?.payload.month;
  if (!active || !month) return null;
  const rows = [
    { key: "revenue", name: <span>Revenue</span>, cents: month.revenue_cents },
    ...month.categories
      .filter((each) => BigInt(each.cents) !== 0n)
      .map((each) => ({ key: each.category, name: <CategoryLabel category={each.category} />, cents: each.cents })),
    { key: "expenses", name: <span>Total expenses</span>, cents: month.expenses_cents },
  ];
  return (
    <ChartTooltip
      value={`Profit ${sum(month.profit_cents)}`}
      label={
        <>
          <span className="block">{monthTitle(month)}</span>
          <ul className="mt-1 text-ink">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-4">
                {row.name}
                <span className="num">{sum(row.cents)}</span>
              </li>
            ))}
          </ul>
        </>
      }
    />
  );
}

/**
 * Every month's figures as buttons, for the keyboard and screen readers, since the chart's parts
 * aren't reached by Tab. Each opens the entries behind it, as clicking the chart does (X9).
 */
function MonthsTable({
  months,
  onOpen,
  register,
}: {
  months: ChartMonth[];
  onOpen: (target: Target) => void;
  register: (key: string, element: HTMLButtonElement | null) => void;
}) {
  function button(month: ChartMonth, figure: Figure, name: string, cents: string) {
    return (
      <button
        type="button"
        ref={(element) => register(registerKey(figure, month.first), element)}
        aria-label={`${name}, ${monthTitle(month)}, ${sum(cents)}`}
        onClick={() => onOpen(targetOf(month, figure, name))}
      >
        {sum(cents)}
      </button>
    );
  }
  return (
    <table className="sr-only">
      <caption>Profit and loss for the last 12 months</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col">Revenue</th>
          {CATEGORIES.map((category) => (
            <th key={category.value} scope="col">
              {category.label}
            </th>
          ))}
          <th scope="col">Total expenses</th>
          <th scope="col">Profit</th>
        </tr>
      </thead>
      <tbody>
        {months.map((month, index) => (
          <tr key={month.month}>
            <th scope="row">
              {monthTitle(month)}
              {index === months.length - 1 ? ", so far" : ""}
            </th>
            <td>{button(month, "revenue", "Revenue", month.revenue_cents)}</td>
            {month.categories.map((each) => (
              <td key={each.category}>{button(month, `expense_${each.category}`, each.name, each.cents)}</td>
            ))}
            <td>{button(month, "expenses", "Total expenses", month.expenses_cents)}</td>
            <td>{button(month, "profit", "Profit", month.profit_cents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The months' names under their columns, the year under the first and each January, and "so far" under this month. */
function MonthLabels({ months }: { months: ChartMonth[] }) {
  return (
    <ol
      className="grid h-11 flex-none text-center text-[12px] leading-4 text-muted"
      style={{ marginRight: CHART.axisWidth, gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
    >
      {months.map((month, index) => (
        <li key={month.month} className="pt-1.5">
          <span className="num block">{month.label}</span>
          {(index === 0 || month.label === "Jan") && <span className="block">{month.year}</span>}
          {index === months.length - 1 && <span className="block font-medium text-ink">so far</span>}
        </li>
      ))}
    </ol>
  );
}

/** The swatches and names of what the chart draws, in one line (X10). */
export function Legend() {
  return (
    <ul
      aria-label="Legend"
      className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[13px] leading-[18px]"
    >
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2.5 flex-none rounded-full" style={{ background: FILLS.revenue }} />
        Revenue
      </li>
      <li className="flex items-center gap-1.5">
        <svg aria-hidden="true" width="16" height="3" className="flex-none">
          <line x1="0" y1="1.5" x2="16" y2="1.5" stroke={FILLS.profit} strokeWidth={3} />
        </svg>
        Profit
      </li>
      {CATEGORIES.map((category) => (
        <li key={category.value} className="flex items-center gap-1.5">
          <Swatch category={category.value} />
          {category.label}
        </li>
      ))}
    </ul>
  );
}

type Props = {
  months: ChartMonth[];
  onOpen: (target: Target) => void;
  register: (key: string, element: HTMLButtonElement | null) => void;
};

/**
 * The last 12 months (X8): a revenue column and beside it the expenses stacked by category, in the
 * categories' colors, with a bold line through the profit. It draws what the reply says and adds
 * nothing up. Clicking a part opens the entries behind it (X9).
 */
export function ProfitChart({ months, onOpen, register }: Props) {
  const { ref, size } = useSize();
  const columns = columnsOf(months);
  const plotHeight = size.height - CHART.top - CHART.bottom;
  const stack = stackScale(
    [
      ...columns.map((column) => CATEGORIES.map((category) => column.spent[category.value])),
      ...columns.map((c) => [c.revenue]),
    ],
    plotHeight,
  );
  const highest = Math.max(0, ...columns.map((column) => column.profit));
  const lowest = Math.min(0, ...columns.map((column) => column.profit));
  const top = Math.max(stack.top, highest > 0 ? niceTop(highest) : 0);
  const bottom = lowest < 0 ? -niceTop(-lowest) : 0;
  const ticks = ticksOf(top, bottom, plotHeight);

  function revenueShape(bar: BarShapeProps) {
    return (
      <Rectangle x={bar.x} y={bar.y} width={bar.width} height={bar.height} radius={[4, 4, 0, 0]} fill={FILLS.revenue} />
    );
  }

  function categoryShape(place: number) {
    const { fill } = CATEGORIES[place];
    return function Segment(bar: BarShapeProps) {
      const column = bar.payload as Column;
      const has = (category: { value: Category }) => column.spent[category.value] > 0;
      return (
        <StackSegment
          bar={bar}
          fill={fill}
          onAnother={CATEGORIES.slice(0, place).some(has)}
          onTop={!CATEGORIES.slice(place + 1).some(has)}
        />
      );
    };
  }

  function profitDot({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) {
    if (cx === undefined || cy === undefined || index === undefined) return <g key={index} />;
    return (
      <circle
        key={index}
        cx={cx}
        cy={cy}
        r={5}
        fill={FILLS.profit}
        stroke={FILLS.casing}
        strokeWidth={2}
        className="cursor-pointer"
        onClick={() => onOpen(targetOf(months[index], "profit", "Profit"))}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        role="img"
        aria-label="Revenue, expenses by category and profit for each of the last 12 months"
        className="relative min-h-0 flex-1"
      >
        {size.width > 0 && size.height > 0 && (
          <ComposedChart
            width={size.width}
            height={size.height}
            data={columns}
            barGap={CHART.gap}
            margin={{ top: CHART.top, right: 0, bottom: CHART.bottom, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-grid)" horizontalValues={ticks} />
            <XAxis dataKey="month.month" hide />
            <YAxis
              orientation="right"
              width={CHART.axisWidth}
              domain={[bottom, top]}
              ticks={ticks}
              interval={0}
              tickFormatter={centsAxis}
              axisLine={false}
              tickLine={false}
              tick={MUTED_AXIS_TEXT}
            />
            <Tooltip content={<Tip />} cursor={{ fill: "var(--color-page)" }} isAnimationActive={false} />
            <ReferenceLine y={0} stroke="var(--color-line)" strokeWidth={1} />
            <Bar
              dataKey="revenue"
              stackId="revenue"
              barSize={CHART.columnWidth}
              isAnimationActive={false}
              shape={revenueShape}
              className="cursor-pointer"
              onClick={(_data, index) => onOpen(targetOf(months[index], "revenue", "Revenue"))}
            />
            {CATEGORIES.map((category, place) => (
              <Bar
                key={category.value}
                dataKey={(column: Column) => stack.drawn(column.spent[category.value])}
                stackId="expenses"
                barSize={CHART.columnWidth}
                isAnimationActive={false}
                shape={categoryShape(place)}
                className="cursor-pointer"
                onClick={(_data, index) => onOpen(targetOf(months[index], `expense_${category.value}`, category.label))}
              />
            ))}
            {/* The casing keeps the line apart from the ink columns it crosses. */}
            <Line
              dataKey="profit"
              type="linear"
              stroke={FILLS.casing}
              strokeWidth={7}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="profit"
              type="linear"
              stroke={FILLS.profit}
              strokeWidth={3}
              dot={profitDot}
              activeDot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        )}
      </div>
      <MonthLabels months={months} />
      <MonthsTable months={months} onOpen={onOpen} register={register} />
    </div>
  );
}
