import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";

import { Field } from "../components/Field";
import { FormDialog } from "../components/FormDialog";
import { RecordPicker } from "../components/RecordPicker";
import { SidePanel } from "../components/RecordLayout";
import { useDeals, type DealDetail, type OrganizationDetail } from "../crm/queries";
import { price } from "../lib/money";
import { useNotify } from "../lib/notify";
import { InvoiceChip } from "./InvoiceChip";
import { useInvoices, useStartInvoice, type InvoiceFilter, type InvoiceRow } from "./queries";

const PICK_A_DEAL = "Choose a won deal";

/** Starts a draft on a deal and opens it, once however quickly it's asked for (V4). */
function useStart() {
  const start = useStartInvoice();
  const navigate = useNavigate();
  const notify = useNotify();
  const starting = useRef(false);
  async function startOn(dealId: number) {
    if (starting.current) return;
    starting.current = true;
    try {
      const draft = await start.mutateAsync(dealId);
      void navigate(`/invoices/${draft.id}`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      starting.current = false;
    }
  }
  return { startOn, pending: start.isPending };
}

/** Asks which deal, from won deals only, then opens the new draft (V4). */
export function NewInvoiceDialog({ onClose }: { onClose: () => void }) {
  const deals = useDeals();
  const { startOn, pending } = useStart();
  const [chosen, setChosen] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const won = useMemo(
    () =>
      (deals.data ?? [])
        .filter((deal) => deal.stage === "won")
        .map((deal) => ({ id: deal.id, name: deal.name, hint: deal.organization_name })),
    [deals.data],
  );

  async function submit() {
    if (chosen === null) return setError(PICK_A_DEAL);
    await startOn(chosen);
  }

  return (
    <FormDialog title="New invoice" submitLabel="New invoice" pending={pending} onClose={onClose} onSubmit={submit}>
      <Field label="Deal" htmlFor="new-invoice-deal" error={error}>
        <RecordPicker
          id="new-invoice-deal"
          label="Deal"
          noun="won deal"
          value={chosen}
          options={won}
          invalid={!!error}
          onChange={(id) => {
            setChosen(id);
            setError(undefined);
          }}
        />
      </Field>
    </FormDialog>
  );
}

/** New invoice: on a won deal's panel it starts the draft at once, and elsewhere it asks for the deal first. */
export function NewInvoiceButton({ dealId, primary = true }: { dealId?: number; primary?: boolean }) {
  const { startOn, pending } = useStart();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button
        type="button"
        className={primary ? "btn btn-primary" : "btn btn-secondary"}
        disabled={pending}
        onClick={() => (dealId === undefined ? setAsking(true) : void startOn(dealId))}
      >
        New invoice
      </button>
      {asking && <NewInvoiceDialog onClose={() => setAsking(false)} />}
    </>
  );
}

/**
 * One invoice: its number, or Draft, and its chip, with its total and what's owed at the right.
 * On an organization's page its deal's name goes on a line of its own under the number, so a
 * long one keeps the column's width rather than sharing a line with the chip (V21).
 */
function InvoiceLink({ invoice, withDeal }: { invoice: InvoiceRow; withDeal: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link to={`/invoices/${invoice.id}`} className="link font-medium">
            {invoice.number ? (
              <span className="num text-[13px]">{invoice.number}</span>
            ) : (
              <span className="text-muted">Draft</span>
            )}
          </Link>
          <InvoiceChip shows={invoice.shows_as} />
        </div>
        {withDeal && <div className="truncate text-[13px] leading-[18px] text-muted">{invoice.deal.name}</div>}
      </div>
      <div className="flex-none text-right">
        <div className="num text-[13px]">{price(invoice.total_cents)}</div>
        <div className="num text-[12px] text-muted">{price(invoice.owed_cents)} owed</div>
      </div>
    </li>
  );
}

function InvoicesPanel({
  filter,
  withDeal,
  empty,
  action,
}: {
  filter: InvoiceFilter;
  withDeal: boolean;
  empty: string;
  action?: ReactNode;
}) {
  const invoices = useInvoices(filter);
  return (
    <SidePanel title="Invoices" action={action}>
      {invoices.error && !invoices.data ? (
        <p className="py-1 text-muted">Couldn't load this.</p>
      ) : invoices.data?.length === 0 ? (
        <p className="py-1 text-muted">{empty}</p>
      ) : (
        <ul aria-label="Invoices">
          {(invoices.data ?? []).map((invoice) => (
            <InvoiceLink key={invoice.id} invoice={invoice} withDeal={withDeal} />
          ))}
        </ul>
      )}
    </SidePanel>
  );
}

/** A deal's invoices, newest first, with New invoice once it's won (V20). */
export function DealInvoices({ record }: { record: DealDetail }) {
  const won = record.stage === "won";
  return (
    <InvoicesPanel
      filter={{ deal_id: record.id }}
      withDeal={false}
      empty={won ? "No invoices yet." : "A deal can be invoiced once it's won."}
      action={won ? <NewInvoiceButton dealId={record.id} primary={false} /> : undefined}
    />
  );
}

/** Those issued to the organization, and the drafts on its deals, each with its deal (V21). */
export function OrganizationInvoices({ record }: { record: OrganizationDetail }) {
  return <InvoicesPanel filter={{ organization_id: record.id }} withDeal empty="No invoices yet." />;
}
