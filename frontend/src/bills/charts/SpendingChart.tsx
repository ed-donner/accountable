import { Bar, BarChart, CartesianGrid, LabelList, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";

import { AXIS_TEXT as CHART_AXIS_TEXT } from "../../components/charts/axes";
import { ChartTooltip } from "../../components/charts/ChartTooltip";
import { useSize } from "../../components/charts/useSize";
import { price, shortMoney } from "../../lib/money";
import { CATEGORIES, CategoryLabel, Swatch } from "../categories";
import type { Category, SpendingMonth } from "../queries";
import { StackSegment, stackScale } from "./StackSegment";

const AXIS_TEXT = { ...CHART_AXIS_TEXT, fill: "var(--color-muted)" };
// The top keeps room for this month's total and "so far", so they never sit on a column.
const MARGIN = { top: 44, right: 52, bottom: 24 };
const COLUMN_WIDTH = 22;

/**
 * A month as the chart draws it, in numbers, which are close enough for heights at any size,
 * with the month's exact sums kept for every figure shown.
 */
type Column = { spent: SpendingMonth; label: string; total: number; current: boolean } & Record<Category, number>;

function columnsOf(months: SpendingMonth[]): Column[] {
  const last = months.length - 1;
  return months.map((month, index) => {
    const heights = CATEGORIES.map((category) => [category.value, Number(month.categories[category.value])]);
    return {
      spent: month,
      label: month.label,
      total: Number(month.total_cents),
      current: index === last,
      ...(Object.fromEntries(heights) as Record<Category, number>),
    };
  });
}

/** A sum from the backend's digits, to the cent. */
function exact(cents: string) {
  return price(BigInt(cents));
}

function monthName(column: Pick<Column, "label" | "current">) {
  return column.current ? `${column.label} so far` : column.label;
}

/** Money is in cents here, and the axis shows dollars. */
function centsAxis(cents: number) {
  return shortMoney(cents / 100);
}

type TipProps = { active?: boolean; payload?: { payload: Column }[] };

/** The month pointed at: each category's total and the month's. */
function Tip({ active, payload }: TipProps) {
  const column = payload?.[0]?.payload;
  if (!active || !column) return null;
  return (
    <ChartTooltip
      value={exact(column.spent.total_cents)}
      label={
        <>
          <span className="block">{monthName(column)}</span>
          <ul className="mt-1 text-ink">
            {CATEGORIES.map((category) => (
              <li key={category.value} className="flex items-center justify-between gap-4">
                <CategoryLabel category={category.value} />
                <span className="num">{exact(column.spent.categories[category.value])}</span>
              </li>
            ))}
          </ul>
        </>
      }
    />
  );
}

/** Each month's spending by category, for anyone who can't see the chart. */
function SpendingTable({ columns }: { columns: Column[] }) {
  return (
    <table className="sr-only">
      <caption>Spending by category for the last 12 months</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          {CATEGORIES.map((category) => (
            <th key={category.value} scope="col">
              {category.label}
            </th>
          ))}
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {columns.map((column) => (
          <tr key={column.spent.month}>
            <th scope="row">{monthName(column)}</th>
            {CATEGORIES.map((category) => (
              <td key={category.value}>{exact(column.spent.categories[category.value])}</td>
            ))}
            <td>{exact(column.spent.total_cents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Legend() {
  return (
    <ul aria-label="Categories" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-[18px]">
      {CATEGORIES.map((category) => (
        <li key={category.value} className="flex items-center gap-2">
          <Swatch category={category.value} />
          {category.label}
        </li>
      ))}
    </ul>
  );
}

type LabelProps = { x?: number | string; width?: number | string; index?: number };

/** One column a month, stacked from Software at the bottom to Other at the top (E23). */
export function SpendingChart({ months }: { months: SpendingMonth[] }) {
  const { ref, size } = useSize();
  const columns = columnsOf(months);
  const last = columns.length - 1;
  const plotHeight = size.height - MARGIN.top - MARGIN.bottom;
  const { top, drawn } = stackScale(
    columns.map((column) => CATEGORIES.map((category) => column[category.value])),
    plotHeight,
  );

  function categoryShape(place: number) {
    const { fill } = CATEGORIES[place];
    return function Segment(bar: BarShapeProps) {
      const column = bar.payload as Column;
      const has = (category: { value: Category }) => column[category.value] > 0;
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

  /** This month's total, with "so far" under it, above its column and clear of the others. */
  function soFar({ x = 0, width = 0, index }: LabelProps) {
    if (index !== last) return null;
    const right = Number(x) + Number(width);
    return (
      <g>
        <text
          x={right}
          y={16}
          textAnchor="end"
          style={{ ...CHART_AXIS_TEXT, fontSize: 13, fill: "var(--color-ink)", fontWeight: 500 }}
        >
          {exact(columns[last].spent.total_cents)}
        </text>
        <text x={right} y={32} textAnchor="end" style={{ ...AXIS_TEXT, fill: "var(--color-ink)" }}>
          so far
        </text>
      </g>
    );
  }

  return (
    <>
      <div
        ref={ref}
        role="img"
        aria-label={`Spending by category for the last 12 months, with ${exact(columns[last].spent.total_cents)} so far this month`}
        className="min-h-0 flex-1"
      >
        {size.width > 0 && size.height > 0 && (
          <BarChart
            width={size.width}
            height={size.height}
            data={columns}
            margin={{ top: MARGIN.top, right: 0, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-grid)" horizontalValues={[top / 2, top]} />
            <XAxis
              dataKey="label"
              interval={0}
              axisLine={false}
              tickLine={false}
              tick={AXIS_TEXT}
              height={MARGIN.bottom}
            />
            <YAxis
              orientation="right"
              width={MARGIN.right}
              domain={[0, top]}
              ticks={[top / 2, top]}
              tickFormatter={centsAxis}
              axisLine={false}
              tickLine={false}
              tick={AXIS_TEXT}
            />
            <Tooltip content={<Tip />} cursor={{ fill: "var(--color-page)" }} />
            {CATEGORIES.map((category, place) => (
              <Bar
                key={category.value}
                dataKey={(column: Column) => drawn(column[category.value])}
                stackId="spending"
                barSize={COLUMN_WIDTH}
                isAnimationActive={false}
                shape={categoryShape(place)}
              >
                {place === CATEGORIES.length - 1 && <LabelList dataKey="total" content={soFar} />}
              </Bar>
            ))}
          </BarChart>
        )}
      </div>
      <Legend />
      <SpendingTable columns={columns} />
    </>
  );
}
