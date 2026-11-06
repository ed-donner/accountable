import type { ReactNode } from "react";

import { CategoryLabel } from "../../components/charts/categories";
import { change, margin, sum } from "./figures";
import type { Figure, ShownPeriod } from "./queries";

type Props = {
  period: ShownPeriod;
  /** The period before's name, for the change column's heading. Null where there is none. */
  previousLabel: string | null;
  /** The switch, the arrows and the label, at the left of the header. */
  switcher: ReactNode;
  /** Opens the entries behind a figure (X13). */
  onOpen: (figure: Figure, name: string, opener: HTMLButtonElement) => void;
  /** Registers each amount's button, so focus can come back to it. */
  register: (key: string, element: HTMLButtonElement | null) => void;
};

type Row = {
  figure: Figure;
  name: string;
  label: ReactNode;
  amount: string;
  change: string;
  strong?: boolean;
  gap?: boolean;
  quiet?: boolean;
};

export const registerKey = (figure: Figure, first: string) => `${figure}|${first}`;

/** The rows in the order of X2, as the backend gave them. */
function rowsOf(period: ShownPeriod): Row[] {
  return [
    {
      figure: "revenue",
      name: "Revenue",
      label: "Revenue",
      amount: sum(period.revenue_cents),
      change: change(period.changes.revenue),
      strong: true,
    },
    ...period.categories.map((each, index) => ({
      figure: `expense_${each.category}`,
      name: each.name,
      label: <CategoryLabel category={each.category} />,
      amount: sum(each.cents),
      change: change(period.changes.categories[index]),
      quiet: BigInt(each.cents) === 0n,
    })),
    {
      figure: "expenses",
      name: "Total expenses",
      label: "Total expenses",
      amount: sum(period.expenses_cents),
      change: change(period.changes.expenses),
      strong: true,
    },
    {
      figure: "profit",
      name: "Profit",
      label: "Profit",
      amount: sum(period.profit_cents),
      change: change(period.changes.profit),
      strong: true,
      gap: true,
    },
  ];
}

const FIGURE_BUTTON = "num cursor-pointer rounded-control hover:underline focus-visible:underline";

/**
 * The statement (X2, X11, X12): a header with the switch and the heading for the change column, then
 * the figures, each amount a button and each change text. It shows what the backend sent and adds
 * nothing up, even if a reply's profit isn't its revenue less its expenses.
 */
export function Statement({ period, previousLabel, switcher, onOpen, register }: Props) {
  return (
    <>
      <div className="flex items-center justify-between gap-6">
        {switcher}
        <p className="text-muted">{previousLabel ? `Change from ${previousLabel}` : "Change"}</p>
      </div>
      <table className="mt-3 w-full">
        <caption className="sr-only">Profit and loss for {period.label}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Figure</th>
            <th scope="col">Amount</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rowsOf(period).map((row) => (
            <tr key={row.figure} className={`h-9 ${row.strong ? "font-semibold" : ""}`}>
              <th
                scope="row"
                className={`text-left ${row.strong ? "font-semibold" : "font-normal"} ${row.gap ? "pt-3" : ""}`}
              >
                {row.label}
              </th>
              <td className={`text-right ${row.gap ? "pt-3" : ""} ${row.quiet ? "text-muted" : ""}`}>
                <button
                  type="button"
                  ref={(element) => register(registerKey(row.figure, period.first), element)}
                  aria-label={`${row.name}, ${row.amount}. Show the entries`}
                  onClick={(event) => onOpen(row.figure, row.name, event.currentTarget)}
                  className={FIGURE_BUTTON}
                >
                  {row.amount}
                </button>
              </td>
              <td className={`num w-40 text-right ${row.gap ? "pt-3" : ""}`}>{row.change}</td>
            </tr>
          ))}
          <tr className="h-9">
            <th scope="row" className="text-left font-normal">
              Profit margin
            </th>
            <td className="text-right">
              <button
                type="button"
                aria-label={`Profit margin, ${margin(period.margin_tenths)}. Show the profit's entries`}
                onClick={(event) => onOpen("profit", "Profit", event.currentTarget)}
                className={FIGURE_BUTTON}
              >
                {margin(period.margin_tenths)}
              </button>
            </td>
            <td className="num w-40 text-right">{change(period.changes.margin)}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
