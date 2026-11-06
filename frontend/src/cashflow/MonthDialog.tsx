import { format, parseISO } from "date-fns";
import { Dialog } from "radix-ui";
import { Link } from "react-router";

import { Chip } from "../components/Chip";
import { LoadFailed } from "../components/LoadFailed";
import { formatDate } from "../lib/dates";
import { price } from "../lib/money";
import { useToday } from "../lib/useToday";
import { plural } from "../lib/words";
import { useExpected, type CashMonth, type ExpectedGroup, type ExpectedItem } from "./queries";

type Kind = "invoice" | "bill" | "deal";

/** Each record's own address, so the cash flow needs nothing from the areas it lists. */
const ADDRESSES: Record<Kind, string> = { invoice: "/invoices", bill: "/bills", deal: "/deals" };

function monthName(month: CashMonth) {
  return format(parseISO(`${month.month}-01`), "MMMM yyyy");
}

/** When it's due, or for a deal when it closes, with its chip once that's passed. */
function Due({ item, kind, today }: { item: ExpectedItem; kind: Kind; today: string }) {
  const passed = item.dueOn < today;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {kind === "deal" ? "Closes" : "Due"} {formatDate(item.dueOn)}
      {passed && <Chip tone="alert">{kind === "deal" ? "Late" : "Overdue"}</Chip>}
      {kind === "invoice" && item.daysPaidLate ? (
        <span>Pays {plural(item.daysPaidLate, "day")} late on average</span>
      ) : null}
    </span>
  );
}

function Item({ item, kind, today }: { item: ExpectedItem; kind: Kind; today: string }) {
  return (
    <li className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <Link to={`${ADDRESSES[kind]}/${item.id}`} className={kind === "deal" ? "font-medium" : "num font-medium"}>
          {item.name}
        </Link>
        {item.organization && <span className="text-muted"> {item.organization}</span>}
        <div className="mt-0.5 text-[13px] leading-[18px] text-muted">
          <Due item={item} kind={kind} today={today} />
        </div>
      </div>
      <div className="flex-none text-right">
        <span className="num block font-medium">{price(item.cents)}</span>
        <span className="block text-[13px] leading-[18px] text-muted">Expected {formatDate(item.expectedOn)}</span>
      </div>
    </li>
  );
}

function Group({ title, group, kind, today }: { title: string; group: ExpectedGroup; kind: Kind; today: string }) {
  if (group.items.length === 0) return null;
  return (
    <section aria-label={title} className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] leading-[18px] font-semibold">{title}</h3>
        <span className="num font-medium">{price(group.total)}</span>
      </div>
      <ul className="divide-y divide-grid">
        {group.items.map((item) => (
          <Item key={item.id} item={item} kind={kind} today={today} />
        ))}
      </ul>
    </section>
  );
}

function Listed({ month, withDeals }: { month: CashMonth; withDeals: boolean }) {
  const expected = useExpected(month.month);
  const today = useToday();
  const { data } = expected;
  // A failed read says so, with Try again, and a later one keeps the list read before, never showing it as up to date (N6).
  const failed = (
    <LoadFailed keeping={data !== undefined} error={expected.error} onRetry={() => void expected.refetch()} />
  );
  if (!data) return failed;
  const { comingIn, goingOut, likelyDeals } = data;
  const shown = [comingIn, goingOut, ...(withDeals ? [likelyDeals] : [])];
  return (
    <>
      {failed}
      {shown.every((group) => group.items.length === 0) ? (
        <p className="mt-4">Nothing expected in {monthName(month)}.</p>
      ) : (
        <>
          <Group title="Coming in" group={comingIn} kind="invoice" today={today} />
          <Group title="Going out" group={goingOut} kind="bill" today={today} />
          {withDeals && <Group title="Likely deals" group={likelyDeals} kind="deal" today={today} />}
        </>
      )}
    </>
  );
}

type Props = {
  month: CashMonth;
  withDeals: boolean;
  onClose: () => void;
  /** Puts focus back on the month's label, which Radix can't, since no Dialog.Trigger opened it. */
  onCloseFocus: () => void;
};

/**
 * What's expected in this month or one of the three after it (Y17): the invoices, the bills,
 * and with the switch on the deals, read from their own route as the dialog opens.
 */
export function MonthDialog({ month, withDeals, onClose, onCloseFocus }: Props) {
  const title = `${month.kind === "current" ? "Still expected in" : "Expected in"} ${monthName(month)}`;
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
            <Dialog.Title className="text-[20px] leading-7 font-semibold">{title}</Dialog.Title>
            <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
              <Listed month={month} withDeals={withDeals} />
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
