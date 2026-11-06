import { Dialog } from "radix-ui";
import { Link } from "react-router";

import { LoadFailed } from "../components/LoadFailed";
import { formatDate } from "../lib/dates";
import { price } from "../lib/money";
import { EVENT_WORDS, ROWS, effect, type FigureId } from "./balance";
import { useEntriesUpTo, type EntryReply } from "./queries";

/** The figure opened: which, how much it was on the day, and the day it was opened on. */
export type Opened = { id: FigureId; name: string; cents: bigint; day: string };

function Row({ entry, id }: { entry: EntryReply; id: FigureId }) {
  return (
    <li className="flex items-start justify-between gap-4 py-2.5">
      <span className="num w-[100px] flex-none text-[13px] leading-5 text-muted">{formatDate(entry.entry_date)}</span>
      <div className="min-w-0 flex-1">
        <Link to={entry.link} className="font-medium">
          {EVENT_WORDS[entry.event] ?? entry.event}
        </Link>
        {entry.created_by && <div className="text-[13px] leading-[18px] text-muted">{entry.created_by.name}</div>}
      </div>
      <span className="num flex-none font-medium">{price(effect(entry, id))}</span>
    </li>
  );
}

function Listed({ opened }: { opened: Opened }) {
  const entries = useEntriesUpTo(ROWS.find((row) => row.id === opened.id)!.accounts, opened.day);
  const { data } = entries;
  const failed = (
    <LoadFailed keeping={data !== undefined} error={entries.error} onRetry={() => void entries.refetch()} />
  );
  if (!data) return failed;
  // An entry posted between two reads can move the next page's start, so a repeat is shown once.
  const seen = new Set<number>();
  const shown = data.pages.flatMap((page) => page.entries).filter((entry) => !seen.has(entry.id) && seen.add(entry.id));
  const total = data.pages[0].total;
  return (
    <>
      {failed}
      {total === 0 ? (
        <p className="mt-4">No entries up to {formatDate(opened.day)}.</p>
      ) : (
        <ul className="divide-y divide-grid">
          {shown.map((entry) => (
            <Row key={entry.id} entry={entry} id={opened.id} />
          ))}
        </ul>
      )}
      {total > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[13px] leading-[18px] text-muted">
            Showing {shown.length} of {total}
          </p>
          {entries.hasNextPage && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={entries.isFetchingNextPage}
              onClick={() => void entries.fetchNextPage()}
            >
              Show more
            </button>
          )}
        </div>
      )}
    </>
  );
}

type Props = {
  opened: Opened;
  onClose: () => void;
  /** Puts focus back on the figure, which Radix can't, since no Dialog.Trigger opened it. */
  onCloseFocus: () => void;
};

/**
 * The entries behind one of the balance sheet's figures, up to the day it was opened on (X11 to X14). It
 * lists what the books' route gives, newest first, and adds nothing of its own.
 */
export function EntriesDialog({ opened, onClose, onCloseFocus }: Props) {
  const day = formatDate(opened.day);
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
            className="flex max-h-[min(640px,calc(100vh-48px))] w-full max-w-[560px] flex-col rounded-panel bg-raised p-6 shadow-(--shadow-dialog)"
          >
            <Dialog.Title className="text-[20px] leading-7 font-semibold">
              {opened.name} up to {day}
            </Dialog.Title>
            <p className="mt-2 flex items-baseline gap-3">
              <span className="num text-[24px] leading-[30px] font-medium">{price(opened.cents)}</span>
              <span className="text-muted">Balance on {day}</span>
            </p>
            <div className="-mx-6 mt-2 min-h-0 flex-1 overflow-y-auto px-6">
              <Listed opened={opened} />
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
