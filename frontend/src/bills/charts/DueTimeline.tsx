import { addDays, format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";

import { AXIS_TEXT as CHART_AXIS_TEXT } from "../../components/charts/axes";
import { ChartTooltip } from "../../components/charts/ChartTooltip";
import { useSize } from "../../components/charts/useSize";
import { formatDate, formatShortDate } from "../../lib/dates";
import { price, shortMoney } from "../../lib/money";
import { plural } from "../../lib/words";
import { CategoryLabel, categoryStyle } from "../categories";
import type { DueBill } from "../queries";
import { StackSegment, stackScale } from "./StackSegment";

const AXIS_TEXT = { ...CHART_AXIS_TEXT, fill: "var(--color-muted)" };
/** Today and the 30 days after it, both ends included (E22). */
const DAYS = 31;
const WEEK = 7;
const MARGIN = { top: 16, right: 48, bottom: 24 };
// Room either side for "Today" and the last week's date, centered under their days.
const AXIS_PADDING = { left: 18, right: 6 };
const BAR_WIDTH = 6;

export type DueDay = { day: number; date: string; bills: DueBill[] };

/** Each of the 31 days, with the bills due on it in due date order, which is the order they stack in. */
export function dueDays(bills: DueBill[], today: string): DueDay[] {
  const start = parseISO(today);
  return Array.from({ length: DAYS }, (_, day) => {
    const date = format(addDays(start, day), "yyyy-MM-dd");
    return { day, date, bills: bills.filter((bill) => bill.due_date === date) };
  });
}

/** Money is in cents here, and the axis shows dollars. */
function centsAxis(cents: number) {
  return shortMoney(cents / 100);
}

function BillLabel({ bill }: { bill: DueBill }) {
  return (
    <>
      <span className="block">
        {bill.supplier} {bill.bill_number}
      </span>
      <span className="block text-ink">
        <CategoryLabel category={bill.category} />
      </span>
    </>
  );
}

type TipProps = { active?: boolean; payload?: { name?: string | number; payload: DueDay }[] };

/** The bill pointed at, not the whole day: each layer of the stack is named by its place. */
function Tip({ active, payload }: TipProps) {
  const item = payload?.[0];
  const bill = item?.payload.bills[Number(item.name)];
  if (!active || !bill) return null;
  return <ChartTooltip value={price(bill.total_cents)} label={<BillLabel bill={bill} />} />;
}

/** The bills behind the chart, for anyone who can't see it. */
function DueTable({ bills }: { bills: DueBill[] }) {
  return (
    <table className="sr-only">
      <caption>Bills due in the next 30 days</caption>
      <thead>
        <tr>
          <th scope="col">Due date</th>
          <th scope="col">Supplier</th>
          <th scope="col">Bill number</th>
          <th scope="col">Category</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {bills.map((bill) => (
          <tr key={bill.id}>
            <td>{formatDate(bill.due_date)}</td>
            <th scope="row">{bill.supplier}</th>
            <td>{bill.bill_number}</td>
            <td>{categoryStyle(bill.category).label}</td>
            <td>{price(bill.total_cents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A bar at each bill's due date, as tall as its total, in its category's color. A day's
 * bills aren't series, so the stack is built in layers: each day's first bill, then its
 * second, and so on, each layer colored bar by bar (E22).
 */
export function DueTimeline({ bills, today }: { bills: DueBill[]; today: string }) {
  const { ref, size } = useSize();
  const days = dueDays(bills, today);
  const layers = Math.max(...days.map((day) => day.bills.length));
  const plotHeight = size.height - MARGIN.top - MARGIN.bottom;
  const { top, drawn } = stackScale(
    days.map((day) => day.bills.map((bill) => bill.total_cents)),
    plotHeight,
  );
  const ticks = days.filter((day) => day.day % WEEK === 0).map((day) => day.day);
  const lastDay = days[DAYS - 1].date;

  function layerShape(layer: number) {
    return function Segment(bar: BarShapeProps) {
      const day = bar.payload as DueDay;
      const bill = day.bills[layer];
      if (!bill) return null;
      return (
        <StackSegment
          bar={bar}
          fill={categoryStyle(bill.category).fill}
          onAnother={layer > 0}
          onTop={layer === day.bills.length - 1}
        />
      );
    };
  }

  return (
    <>
      <div
        ref={ref}
        role="img"
        aria-label={`${plural(bills.length, "bill")} due from today to ${formatDate(lastDay)}, each at its due date`}
        className="min-h-0 flex-1"
      >
        {size.width > 0 && size.height > 0 && (
          <BarChart
            width={size.width}
            height={size.height}
            data={days}
            margin={{ top: MARGIN.top, right: 0, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-grid)" horizontalValues={[top / 2, top]} />
            <XAxis
              dataKey="day"
              padding={AXIS_PADDING}
              ticks={ticks}
              interval={0}
              tickFormatter={(day: number) => (day === 0 ? "Today" : formatShortDate(days[day].date))}
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
            <Tooltip shared={false} content={<Tip />} cursor={false} />
            {Array.from({ length: layers }, (_, layer) => (
              <Bar
                key={layer}
                name={String(layer)}
                dataKey={(day: DueDay) => drawn(day.bills[layer]?.total_cents ?? 0)}
                stackId="due"
                barSize={BAR_WIDTH}
                isAnimationActive={false}
                shape={layerShape(layer)}
              />
            ))}
          </BarChart>
        )}
      </div>
      <DueTable bills={bills} />
    </>
  );
}
