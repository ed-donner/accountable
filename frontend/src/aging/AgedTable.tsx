import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { LATE_PARTS, latePart } from "../components/charts/lateness";
import { formatDate } from "../lib/dates";
import { price } from "../lib/money";
import { plural } from "../lib/words";
import { AgedBar } from "./AgedBar";
import type { Aged, AgedItem, AgedRow, PartSum, View } from "./queries";

/** How many organizations show at first, and each time "Show more" is pressed (X16). */
export const PAGE = 25;

const WORDS: Record<View, { noun: string; items: string; link: string; empty: string }> = {
  customers: { noun: "invoice", items: "Invoices", link: "/invoices", empty: "Customers owe nothing on this day." },
  suppliers: { noun: "bill", items: "Bills", link: "/bills", empty: "The business owes nothing on this day." },
};

const CELL = "px-2 py-2";

export function Legend() {
  return (
    <ul aria-label="Parts" className="flex flex-wrap gap-x-5 gap-y-1 px-4 pt-4 pb-2 text-[13px]">
      {LATE_PARTS.map((part) => (
        <li key={part.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: part.color }} />
          {part.label}
        </li>
      ))}
    </ul>
  );
}

function Amount({ cents, bold }: { cents: bigint; bold?: boolean }) {
  const tone = cents === 0n ? "text-muted" : bold ? "font-semibold text-ink" : "";
  return <span className={`num ${tone}`}>{price(cents)}</span>;
}

function AmountCells({ parts, total }: { parts: PartSum[]; total: bigint }) {
  return (
    <>
      {parts.map((part) => (
        <td key={part.key} className={`${CELL} text-right`}>
          <Amount cents={part.cents} />
        </td>
      ))}
      <td className={`${CELL} text-right`}>
        <Amount cents={total} bold />
      </td>
    </>
  );
}

function daysWords(item: AgedItem) {
  return item.daysPastDue <= 0 ? "Not yet due" : plural(item.daysPastDue, "day");
}

function Items({ items, view }: { items: AgedItem[]; view: View }) {
  const { link, items: heading } = WORDS[view];
  return (
    <ul aria-label={heading} className="ml-8 rounded-card bg-page px-4 py-2">
      {items.map((item) => {
        const part = latePart(item.part);
        return (
          <li key={item.id} className="grid grid-cols-[110px_110px_110px_minmax(0,1fr)_120px] items-center gap-3 py-1">
            <Link to={`${link}/${item.id}`} className="link num">
              {item.number}
            </Link>
            <span className="num">{formatDate(item.dueOn)}</span>
            <span>{daysWords(item)}</span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: part.color }} />
              {part.label}
            </span>
            <Amount cents={item.cents} />
          </li>
        );
      })}
    </ul>
  );
}

type RowProps = { row: AgedRow; view: View; largest: number; open: boolean; onToggle: () => void };

/** The row opens its items on a click anywhere in it, and by the keyboard through its button. */
function OrganizationRow({ row, view, largest, open, onToggle }: RowProps) {
  const { noun, items } = WORDS[view];
  return (
    <>
      <tr className="cursor-pointer hover:bg-page" onClick={onToggle}>
        <td className={`${CELL} min-w-[200px]`}>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${items} of ${row.name}`}
              className="icon-btn size-6 flex-none"
            >
              <ChevronRight size={16} aria-hidden="true" className={open ? "rotate-90" : undefined} />
            </button>
            <Link to={`/organizations/${row.id}`} className="link" onClick={(event) => event.stopPropagation()}>
              {row.name}
            </Link>
          </div>
        </td>
        <td className={`${CELL} w-full min-w-[200px]`}>
          <AgedBar row={row} largest={largest} noun={noun} />
        </td>
        <AmountCells parts={row.parts} total={row.total} />
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="px-2 pb-2">
            <Items items={row.items} view={view} />
          </td>
        </tr>
      )}
    </>
  );
}

function TotalsRow({ totals }: { totals: Aged["totals"] }) {
  return (
    <tr>
      <th scope="row" className={`${CELL} pt-5 text-left font-semibold text-ink`}>
        Total
      </th>
      <td />
      <AmountCells parts={totals.parts} total={totals.total} />
    </tr>
  );
}

function Nothing({ view }: { view: View }) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
      <p className="font-semibold">Nothing owed.</p>
      <p className="text-muted">{WORDS[view].empty}</p>
    </div>
  );
}

/**
 * The view's legend and table: each organization's bar and five parts, 25 at first, and the totals
 * row last, which covers every organization (X11 to X17). Which rows are open and how many show are
 * kept here, and start again when the view or the day changes, as the page gives this a new key.
 */
export function AgedTable({ aged, view }: { aged: Aged; view: View }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const { rows, totals } = aged;
  const largest = rows.reduce((most, row) => (row.total > most ? row.total : most), 0n);

  function toggle(id: number) {
    setOpen((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <section aria-label="Aged balances" className="panel">
      <Legend />
      {rows.length === 0 ? (
        <Nothing view={view} />
      ) : (
        <div className="overflow-x-auto px-2 pb-4">
          <table className="w-full border-separate border-spacing-y-0.5 text-[14px]">
            <thead className="text-[13px] text-muted">
              <tr>
                <th scope="col" className={`${CELL} text-left font-medium`}>
                  Organization
                </th>
                <th scope="col" className={CELL}>
                  <span className="sr-only">How it is spread by how late</span>
                </th>
                {LATE_PARTS.map((part) => (
                  <th key={part.key} scope="col" className={`${CELL} text-right font-medium whitespace-nowrap`}>
                    {part.label}
                  </th>
                ))}
                <th scope="col" className={`${CELL} text-right font-medium whitespace-nowrap`}>
                  Total owed
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((row) => (
                <OrganizationRow
                  key={row.id}
                  row={row}
                  view={view}
                  largest={Number(largest)}
                  open={open.has(row.id)}
                  onToggle={() => toggle(row.id)}
                />
              ))}
              {shown < rows.length && (
                <tr>
                  <td colSpan={8} className="py-3 text-center">
                    <button type="button" className="btn btn-secondary" onClick={() => setShown(shown + PAGE)}>
                      Show {Math.min(PAGE, rows.length - shown)} more
                    </button>
                  </td>
                </tr>
              )}
              <TotalsRow totals={totals} />
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
