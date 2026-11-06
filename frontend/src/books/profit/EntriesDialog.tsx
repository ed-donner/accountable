import { Dialog } from "radix-ui";
import { Link } from "react-router";

import { Chip } from "../../components/Chip";
import { LoadFailed } from "../../components/LoadFailed";
import { formatDate } from "../../lib/dates";
import { plural } from "../../lib/words";
import { sum } from "./figures";
import { useFigureEntries, type EntryReply, type Target } from "./queries";

/** What happened to the record, from the entry's event: "invoice_issued" is Issued. */
export function eventName(event: string): string {
  const word = event.slice(event.indexOf("_") + 1);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "Invoice INV-0042", "Bill 8841 from Northwind Software", or Deleted bill in muted ink with no link. */
function Source({ entry }: { entry: EntryReply }) {
  const kind = entry.kind.startsWith("bill") ? "bill" : entry.kind;
  if (entry.label === null) {
    return <span className="text-muted">Deleted {kind}</span>;
  }
  return (
    <Link to={entry.link} className="link">
      {kind === "bill" ? "Bill" : "Invoice"} {entry.label}
    </Link>
  );
}

function Row({ entry }: { entry: EntryReply }) {
  return (
    <li className="flex items-baseline gap-3 py-2.5">
      <span className="num w-[92px] flex-none text-[13px] leading-5 text-muted">{formatDate(entry.entry_date)}</span>
      <span className="min-w-0 flex-1">
        <Source entry={entry} />
        <span className="text-muted"> {eventName(entry.event)}</span>
        {entry.reverses_id !== null && (
          <>
            {" "}
            <Chip tone="quiet">Reversal</Chip>
          </>
        )}
      </span>
      <span className="num flex-none">{sum(entry.amount)}</span>
    </li>
  );
}

type Props = {
  target: Target;
  onClose: () => void;
  /** Puts focus back on the figure that was clicked, which Radix can't, since no Dialog.Trigger opened it. */
  onCloseFocus: () => void;
};

/**
 * The entries behind a figure, newest first, 100 at a time (X13). Its amount is the backend's total for
 * the range, which the entries' amounts add up to. Its read is its own, so it can fail on its own.
 */
export function EntriesDialog({ target, onClose, onCloseFocus }: Props) {
  const entries = useFigureEntries(target.figure, target.from, target.to);
  const pages = entries.data?.pages;
  const first = pages?.[0];
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 grid animate-fade-in place-items-center bg-veil p-6">
          <Dialog.Content
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              onCloseFocus();
            }}
            className="flex max-h-[min(720px,calc(100vh-48px))] w-full max-w-[640px] flex-col rounded-panel bg-raised p-6 shadow-(--shadow-dialog)"
          >
            <Dialog.Title className="text-[20px] leading-7 font-semibold">
              {target.name}, {target.periodLabel}
            </Dialog.Title>
            {first && (
              <div className="mt-1 flex items-baseline gap-3">
                <span className="num text-[24px] leading-[30px] font-medium tracking-[-0.02em]">
                  {sum(first.total)}
                </span>
                <span className="text-muted">{plural(first.count, "entry")}</span>
              </div>
            )}
            <div className="-mx-6 mt-3 min-h-0 flex-1 overflow-y-auto px-6">
              <LoadFailed
                keeping={entries.data !== undefined}
                error={entries.error}
                onRetry={() => void (entries.data ? entries.fetchNextPage() : entries.refetch())}
              />
              {pages && (
                <>
                  {first?.count === 0 ? (
                    <p className="py-4 text-muted">No entries.</p>
                  ) : (
                    <ul className="divide-y divide-grid">
                      {pages
                        .flatMap((page) => page.entries)
                        .map((entry) => (
                          <Row key={entry.id} entry={entry} />
                        ))}
                    </ul>
                  )}
                  {entries.hasNextPage && (
                    <div className="py-3">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={entries.isFetchingNextPage}
                        onClick={() => void entries.fetchNextPage()}
                      >
                        Show more
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <Dialog.Close className="btn btn-secondary">Close</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
