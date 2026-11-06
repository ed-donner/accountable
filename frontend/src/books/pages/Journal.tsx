import { Info, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LoadFailed } from "../../components/LoadFailed";
import { PageHeader } from "../../components/PageHeader";
import { useAddress } from "../../lib/useAddress";
import { plural } from "../../lib/words";
import { EntryList } from "../EntryList";
import { ACCOUNTS, anyFilter, findAccount, useEntries, useEntryCount, type EntryFilters } from "../queries";
import { useLoadMore } from "../useLoadMore";

/** How long typing pauses before the search is asked of the backend, as the top bar's does (K3). */
const PAUSE_MS = 150;
const FILTER_NAMES = ["q", "account", "from", "to"] as const;

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6" data-testid="entries-loading">
      {Array.from({ length: 5 }, (_unused, place) => (
        <div key={place} className="animate-pulse">
          <div className="h-5 w-2/3 max-w-[420px] rounded-control bg-page" />
          <div className="mt-3 h-9 rounded-control bg-page" />
          <div className="mt-1 h-9 rounded-control bg-page" />
        </div>
      ))}
    </div>
  );
}

/** The filters live in the address, so refresh, back and forward keep them and a link can be shared (J17). */
function useFilters() {
  const { params, latest, update } = useAddress();
  const filters: EntryFilters = {
    q: params.get("q") ?? "",
    account: params.get("account") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  };
  const set = (name: (typeof FILTER_NAMES)[number], value: string) =>
    update((next) => (value ? next.set(name, value) : next.delete(name)));
  const clear = () => update((next) => FILTER_NAMES.forEach((name) => next.delete(name)));
  return { filters, latest, set, clear };
}

/** The search box keeps what was typed, and writes it to the address once typing pauses. */
function SearchBox({
  q,
  latest,
  onWrite,
}: {
  q: string;
  latest: { current: URLSearchParams };
  onWrite: (q: string) => void;
}) {
  const [text, setText] = useState(q);
  const written = useRef(q);

  useEffect(() => {
    // Back, forward or Clear filters changed the address under the box.
    if (q !== written.current) {
      written.current = q;
      setText(q);
    }
  }, [q]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const wanted = text.trim();
      if (wanted === (latest.current.get("q") ?? "")) return;
      written.current = wanted;
      onWrite(wanted);
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, latest, onWrite]);

  return (
    <div className="relative min-w-[240px] flex-1">
      <Search size={16} aria-hidden="true" className="absolute top-[11px] left-3 text-muted" />
      <input
        type="search"
        value={text}
        maxLength={100}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search description or document"
        aria-label="Search entries"
        className="input pl-9"
      />
    </div>
  );
}

function Toolbar({ filters: shown, latest, set, clear }: ReturnType<typeof useFilters>) {
  return (
    <section aria-label="Filters" className="panel mx-6 mb-3 flex flex-wrap items-center gap-3 p-3">
      <SearchBox q={shown.q} latest={latest} onWrite={(q) => set("q", q)} />
      <select
        aria-label="Account"
        className="input w-[190px]"
        value={findAccount(shown.account) ? shown.account : ""}
        onChange={(event) => set("account", event.target.value)}
      >
        <option value="">All accounts</option>
        {ACCOUNTS.map((account) => (
          <option key={account.key} value={account.key}>
            {account.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        aria-label="From"
        className="input w-[160px]"
        value={shown.from}
        onChange={(event) => set("from", event.target.value)}
      />
      <input
        type="date"
        aria-label="To"
        className="input w-[160px]"
        value={shown.to}
        onChange={(event) => set("to", event.target.value)}
      />
      {anyFilter(shown) && (
        <button type="button" className="btn" onClick={clear}>
          Clear filters
        </button>
      )}
    </section>
  );
}

function Empty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="flex items-center gap-2 text-muted">
        <Info size={18} aria-hidden="true" className="flex-none text-cerulean" />
        {filtered
          ? "No entries match."
          : "No entries yet. They appear here as invoices, payments and bills are entered."}
      </p>
      {filtered && (
        <button type="button" className="btn btn-secondary" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

type Feed = ReturnType<typeof useEntries>;

/** What's under the entries: how many are showing, and Load more while more remain (J20). */
function Foot({ feed, shown, total }: { feed: Feed; shown: number; total: number }) {
  const { sentinel, loadMore } = useLoadMore({
    hasNext: feed.hasNextPage && !feed.isPlaceholderData,
    loading: feed.isFetching,
    pages: feed.data?.pages.length ?? 0,
    fetchNext: feed.fetchNextPage,
  });
  return (
    <div ref={sentinel} className="mt-6 flex flex-col items-center gap-3 text-muted">
      <p>{`Showing ${shown} of ${plural(total, "entry")}`}</p>
      {feed.isFetchingNextPage && <p>Loading more...</p>}
      {feed.hasNextPage && !feed.isFetchingNextPage && (
        <button type="button" className="btn btn-secondary" onClick={loadMore}>
          Load more
        </button>
      )}
    </div>
  );
}

function Entries({ feed, filtered, onClear }: { feed: Feed; filtered: boolean; onClear: () => void }) {
  const pages = feed.data?.pages ?? [];
  const shown = pages.flatMap((page) => page.entries);
  const total = pages[0]?.total;
  return (
    <section aria-label="Entries" className="panel mx-6 mb-6 p-[18px]">
      <LoadFailed keeping={feed.data !== undefined} error={feed.error} onRetry={() => void feed.refetch()} />
      {!feed.data && !feed.error && <Skeleton />}
      {total === 0 && <Empty filtered={filtered} onClear={onClear} />}
      {total !== undefined && shown.length > 0 && (
        <>
          <EntryList entries={shown} showWho />
          <Foot feed={feed} shown={shown.length} total={total} />
        </>
      )}
    </section>
  );
}

/** "230 entries", or "12 of 230 entries" while filtered. */
function countText(total: number | undefined, everything: number | undefined, filtered: boolean) {
  if (total === undefined) return null;
  return filtered && everything !== undefined ? `${total} of ${plural(everything, "entry")}` : plural(total, "entry");
}

/** Every entry in the books, newest first, with a search and filters (J17). Read only (J6). */
export function Journal() {
  const state = useFilters();
  const feed = useEntries(state.filters);
  const everything = useEntryCount();
  const filtered = anyFilter(state.filters);
  const count = countText(feed.data?.pages[0]?.total, everything.data, filtered);
  return (
    <>
      <PageHeader title="Journal">{count && <span className="text-muted">{count}</span>}</PageHeader>
      <Toolbar {...state} />
      <Entries feed={feed} filtered={filtered} onClear={state.clear} />
    </>
  );
}
