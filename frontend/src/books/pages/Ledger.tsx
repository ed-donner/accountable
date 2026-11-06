import { Link, useParams } from "react-router";

import { Chip } from "../../components/Chip";
import { LoadFailed } from "../../components/LoadFailed";
import { MissingRecord } from "../../components/MissingRecord";
import { PageHeader } from "../../components/PageHeader";
import { ApiError } from "../../lib/api";
import { formatDate } from "../../lib/dates";
import { price } from "../../lib/money";
import { plural } from "../../lib/words";
import { BalanceChart } from "../charts/BalanceChart";
import { OPENING_BALANCE_LINK } from "../EntryList";
import { findAccount, useAccountMonths, useLedger, type LedgerLineReply, type LedgerReply } from "../queries";
import { useLoadMore } from "../useLoadMore";

const MONEY = "num w-36 pl-3 text-right text-[14px]";

/** A debit or a credit in its own column, and the other side left empty (J18). */
function Cell({ cents }: { cents: number }) {
  return <td className={MONEY}>{cents > 0 ? price(cents) : null}</td>;
}

function Row({ line }: { line: LedgerLineReply }) {
  const label = line.document ?? (line.kind === "opening_balance" ? OPENING_BALANCE_LINK : null);
  return (
    <tr className="h-9">
      <td className="num w-32 text-[13px] whitespace-nowrap">{formatDate(line.entry_date)}</td>
      <td className="pr-3">
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          {line.description}
          {line.is_reversal && <Chip tone="quiet">Reversal</Chip>}
          {line.is_reversed && <Chip tone="quiet">Reversed</Chip>}
        </span>
      </td>
      <td className="pr-3">
        {label && (
          <Link to={line.link} className="link">
            {label}
          </Link>
        )}
      </td>
      <Cell cents={line.debit_cents} />
      <Cell cents={line.credit_cents} />
      <td className={`${MONEY} font-semibold`}>{price(BigInt(line.balance_cents))}</td>
    </tr>
  );
}

type Feed = ReturnType<typeof useLedger>;

function Lines({ feed }: { feed: Feed }) {
  const pages = feed.data?.pages ?? [];
  const lines = pages.flatMap((page) => page.lines);
  const first = pages[0];
  const { sentinel, loadMore } = useLoadMore({
    hasNext: feed.hasNextPage,
    loading: feed.isFetching,
    pages: pages.length,
    fetchNext: feed.fetchNextPage,
  });
  return (
    <section aria-label="Lines" className="panel mx-6 mt-3 mb-6 px-[18px] pb-3">
      {first && first.total === 0 ? (
        <p className="py-8 text-center text-muted">No entries in this account yet.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="h-9 text-[13px] leading-[18px] text-muted">
              {["Date", "Description", "Document"].map((name) => (
                <th key={name} scope="col" className="sticky top-0 bg-panel text-left font-normal">
                  {name}
                </th>
              ))}
              {["Debit", "Credit", "Balance"].map((name) => (
                <th key={name} scope="col" className="sticky top-0 bg-panel pl-3 text-right font-normal">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <Row key={line.id} line={line} />
            ))}
          </tbody>
        </table>
      )}
      {first && first.total > 0 && (
        <div ref={sentinel} className="mt-3 flex flex-col items-center gap-3 text-muted">
          <p>{`Showing ${lines.length} of ${plural(first.total, "line")}`}</p>
          {feed.isFetchingNextPage && <p>Loading more...</p>}
          {feed.hasNextPage && !feed.isFetchingNextPage && (
            <button type="button" className="btn btn-secondary" onClick={loadMore}>
              Load more
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Headline({ first }: { first: LedgerReply | undefined }) {
  return (
    <section aria-label="Balance" className="panel px-[18px] py-4">
      <h2>Balance</h2>
      <p className="num mt-1 text-[36px] leading-[44px] font-medium tracking-[-0.02em]" data-testid="balance">
        {first ? price(BigInt(first.balance_cents)) : "\u00a0"}
      </p>
      {first && (
        <p className="mt-1 text-[13px] leading-[18px] text-muted">
          {first.last_entry_date
            ? `after ${plural(first.total, "line")}, last on ${formatDate(first.last_entry_date)}`
            : "No entries yet"}
        </p>
      )}
    </section>
  );
}

function Ledger({ account }: { account: NonNullable<ReturnType<typeof findAccount>> }) {
  const ledger = useLedger(account.key);
  const months = useAccountMonths(account.key);
  const first = ledger.data?.pages[0];

  if (ledger.error instanceof ApiError && ledger.error.kind === "missing") return <Missing />;

  return (
    <>
      <PageHeader title={account.name}>
        <span className="text-muted">{account.type}</span>
        <Link to="/accounting/journal" className="link ml-auto text-[14px]">
          All entries
        </Link>
      </PageHeader>
      <LoadFailed onPage keeping={first !== undefined} error={ledger.error} onRetry={() => void ledger.refetch()} />
      <div className="mx-6 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,320px)_1fr]">
        <Headline first={first} />
        <section aria-label="Balance by month" className="panel relative h-[220px] overflow-hidden">
          {months.data && months.data.length > 0 && <BalanceChart months={months.data} name={account.name} />}
          {months.error && !months.data && <LoadFailed error={months.error} onRetry={() => void months.refetch()} />}
        </section>
      </div>
      <Lines feed={ledger} />
    </>
  );
}

function Missing() {
  return <MissingRecord word="account" to="/accounting/journal" section="Journal" />;
}

/** One account's ledger: its balance, a chart of its balance by month, and every line that touched it (J18). */
export function LedgerPage() {
  const account = findAccount(useParams().key ?? "");
  return account ? <Ledger account={account} /> : <Missing />;
}
