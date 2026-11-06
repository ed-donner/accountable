import { Link } from "react-router";

import { Chip } from "../components/Chip";
import { formatDate } from "../lib/dates";
import { price } from "../lib/money";
import { AccountLink } from "./AccountLink";
import type { Entry } from "./queries";

const MONEY_COLUMN = "w-36 pl-3 text-right";

/** What the link of the opening balance's entry says, since it has no number (J17). */
export const OPENING_BALANCE_LINK = "Company settings";

/** An amount in its own column, and the other side left empty, never $0.00 (J17). */
function Money({ cents }: { cents: number }) {
  return <td className={`${MONEY_COLUMN} num text-[14px]`}>{cents > 0 ? price(cents) : null}</td>;
}

function Marks({ entry }: { entry: Entry }) {
  return (
    <span className="ml-auto flex flex-none gap-1.5">
      {entry.reverses_id !== null && <Chip tone="quiet">Reversal</Chip>}
      {entry.reversed_by_id !== null && <Chip tone="quiet">Reversed</Chip>}
    </span>
  );
}

function Totals({ entry }: { entry: Entry }) {
  const debits = entry.lines.reduce((sum, line) => sum + BigInt(line.debit_cents), 0n);
  const credits = entry.lines.reduce((sum, line) => sum + BigInt(line.credit_cents), 0n);
  return (
    <tr className="h-9 border-t border-line font-semibold">
      <th scope="row" className="text-left font-semibold">
        Total
      </th>
      <td className={`${MONEY_COLUMN} num text-[14px]`}>{price(debits)}</td>
      <td className={`${MONEY_COLUMN} num text-[14px]`}>{price(credits)}</td>
    </tr>
  );
}

function EntryBlock({ entry, showWho }: { entry: Entry; showWho: boolean }) {
  const label = entry.document ?? (entry.kind === "opening_balance" ? OPENING_BALANCE_LINK : null);
  return (
    <article aria-label={`${entry.description}, ${formatDate(entry.entry_date)}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="num text-[13px]">{formatDate(entry.entry_date)}</span>
        <span className="font-semibold">{entry.description}</span>
        {label && (
          <Link to={entry.link} className="link">
            {label}
          </Link>
        )}
        <Marks entry={entry} />
      </div>
      {showWho && entry.created_by && (
        <p className="text-[13px] leading-[18px] text-muted">
          {entry.created_by.name}, {formatDate(entry.created_at)}
        </p>
      )}
      <table className="mt-1 w-full">
        <thead>
          <tr className="h-7 text-[13px] leading-[18px] text-muted">
            <th scope="col" className="text-left font-normal">
              Account
            </th>
            <th scope="col" className={`${MONEY_COLUMN} font-normal`}>
              Debit
            </th>
            <th scope="col" className={`${MONEY_COLUMN} font-normal`}>
              Credit
            </th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((line, place) => (
            <tr key={place} className="h-9">
              <td>
                <AccountLink account={line.account} />
              </td>
              <Money cents={line.debit_cents} />
              <Money cents={line.credit_cents} />
            </tr>
          ))}
          <Totals entry={entry} />
        </tbody>
      </table>
    </article>
  );
}

/**
 * Entries as an accountant reads them: each with its lines in a Debit and a Credit column and the totals
 * under them (J17, J19). The Journal and the Accounting panels draw an entry here and nowhere else.
 * `showWho` adds who made the entry and when, which the Journal shows and a panel doesn't.
 */
export function EntryList({ entries, showWho = false }: { entries: Entry[]; showWho?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {entries.map((entry) => (
        <EntryBlock key={entry.id} entry={entry} showWho={showWho} />
      ))}
    </div>
  );
}
