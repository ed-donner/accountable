import { format, parseISO } from "date-fns";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { LoadFailed } from "./LoadFailed";

/**
 * The dashboard's Money section (H10): what customers owe us on the left and what we owe
 * suppliers on the right, each side from its own area. The rows belong to the section, and
 * each side takes them as a subgrid, so the panels stay level across the two. The first row
 * holds a side's "Couldn't refresh this", which moves both sides down together.
 */
export function MoneySection({ children }: { children: ReactNode }) {
  return (
    // The dashboard's own part ends 16px above, so this keeps the 12px between its panels.
    <section aria-labelledby="money-heading" className="-mt-1 flex flex-col gap-3 px-5 pb-4">
      <h2 id="money-heading" className="text-[20px] leading-7 font-semibold">
        Money
      </h2>
      <div className="grid grid-cols-2 grid-rows-[auto_332px_372px] gap-x-3">{children}</div>
    </section>
  );
}

type ColumnProps = {
  /** The side's figures have been read, so its panels can show. */
  loaded: boolean;
  error: unknown;
  onRetry: () => void;
  /** Its OwingPanel and then its MonthsPanel. */
  children?: ReactNode;
};

/** One side of the section. Until its figures arrive, one panel holds its place, saying if the read failed. */
export function MoneyColumn({ loaded, error, onRetry, children }: ColumnProps) {
  return (
    <div className="row-span-3 grid min-w-0 grid-rows-subgrid">
      <div>{loaded && <LoadFailed keeping error={error} onRetry={onRetry} />}</div>
      {loaded ? (
        children
      ) : (
        <div className="panel row-span-2 flex flex-col justify-center">
          <LoadFailed error={error} onRetry={onRetry} />
        </div>
      )}
    </div>
  );
}

type FigureProps = { label: string; amount: string; count: string; to?: string };

/** A headline figure, with its label above and its count below. One that opens a list is a link. */
export function MoneyFigure({ label, amount, count, to }: FigureProps) {
  const shown = (
    <>
      <span className="block text-[13px] leading-[18px] font-semibold">{label}</span>
      <span className="num block text-[24px] leading-[30px] font-medium tracking-[-0.02em]">{amount}</span>
      <span className="block text-[13px] leading-[18px] text-muted">{count}</span>
    </>
  );
  // The link's padding gives its focus ring room, and the margin keeps its text in line with the rest.
  return to ? (
    <Link to={to} className="-mx-1.5 block rounded-control px-1.5">
      {shown}
    </Link>
  ) : (
    <div>{shown}</div>
  );
}

type OwingProps = {
  label: string;
  /** Two MoneyFigures: the whole sum, then how much of it is overdue. */
  figures: ReactNode;
  heading: string;
  /** Anything to the right of the heading, such as a total. */
  beside?: ReactNode;
  children: ReactNode;
};

/** The first row: where things stand, then when it's due. */
export function OwingPanel({ label, figures, heading, beside, children }: OwingProps) {
  return (
    <section aria-label={label} className="panel flex min-h-0 flex-col px-[18px] py-4">
      <div className="grid grid-cols-2 gap-3">{figures}</div>
      <div className="mt-6 mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] leading-[18px] font-semibold">{heading}</h3>
        {beside}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** A sum for one month, as the 12 months' figures give it, with its month as yyyy-MM. */
export type MonthSum = { month: string; amount: string };

function monthName(month: string) {
  return format(parseISO(`${month}-01`), "MMMM");
}

type MonthsProps = {
  label: string;
  /** What's counted, such as "Payments received", which the heading puts before the month. */
  title: string;
  /** Last month's sum, then this month's. */
  months: [MonthSum, MonthSum];
  /** Names the figures for tests, such as "paid" for paid-this-month. */
  testId: string;
  /** Anything to the right of the heading and figures, such as a legend. */
  beside?: ReactNode;
  children: ReactNode;
};

/** The second row: this month's sum beside last month's, over the 12 months' chart. */
export function MonthsPanel({ label, title, months, testId, beside, children }: MonthsProps) {
  const [previous, current] = months;
  return (
    // The row is 12px taller than the panel, which keeps the gap above it.
    <section aria-label={label} className="panel mt-3 flex min-h-0 flex-col px-[18px] py-4">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h3 className="text-[16px] leading-6 font-semibold">
            {title} in {monthName(current.month)}
          </h3>
          <div className="flex items-baseline gap-3">
            <span
              className="num text-[24px] leading-[30px] font-medium tracking-[-0.02em]"
              data-testid={`${testId}-this-month`}
            >
              {current.amount}
            </span>
            <span className="text-[13px] whitespace-nowrap text-muted" data-testid={`${testId}-last-month`}>
              {monthName(previous.month)} <span className="num">{previous.amount}</span>
            </span>
          </div>
        </div>
        {beside}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** A chart's designed empty state, in the space the chart would take. */
export function MoneyEmpty({ children }: { children: ReactNode }) {
  return <p className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-muted">{children}</p>;
}
