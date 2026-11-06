import { useRef } from "react";
import { Link, useNavigate } from "react-router";

import { LoadFailed } from "../components/LoadFailed";
import { Detail } from "../components/RecordLayout";
import { useNotify } from "../lib/notify";
import { useCreateInvoiceFromQuote, useQuoteInvoice } from "./queries";

/** What the quote's page hands over: its own fields, so this file imports nothing of quotes/ (Q38). */
type Props = { quoteId: number; number: string; status: string; dealStage: string };

const NOT_WON = "Move the deal back to Won to invoice this quote.";

/** Create invoice on an accepted quote, or Open invoice once it has one (Q38, V33). */
export function QuoteInvoiceButton({ quoteId, number, status, dealStage }: Props) {
  const { invoice, refetch } = useQuoteInvoice(quoteId);
  const create = useCreateInvoiceFromQuote();
  const navigate = useNavigate();
  const notify = useNotify();
  const creating = useRef(false);
  if (status !== "accepted") return null;

  if (invoice) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => void navigate(`/invoices/${invoice.id}`)}>
        Open invoice
      </button>
    );
  }

  async function createInvoice() {
    if (creating.current) return;
    creating.current = true;
    try {
      const made = await create.mutateAsync(quoteId);
      notify.success(`Invoice created from ${number}.`);
      void navigate(`/invoices/${made.id}`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Something went wrong.");
      // Someone may have made it first, so the button reads what the quote has now (V37).
      void refetch();
    } finally {
      creating.current = false;
    }
  }

  const wonDeal = dealStage === "won";
  return (
    <>
      {!wonDeal && <span className="self-center text-[13px] text-muted">{NOT_WON}</span>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!wonDeal || create.isPending || invoice === undefined}
        onClick={createInvoice}
      >
        Create invoice
      </button>
    </>
  );
}

/** "Invoice INV-0042", or "Draft invoice" before it's issued, linking to it, in the quote's details (V36). */
export function QuoteInvoiceLine({ quoteId, status }: Props) {
  const { invoice, error, refetch } = useQuoteInvoice(quoteId);
  if (status !== "accepted") return null;
  if (error && invoice === undefined) return <LoadFailed error={error} onRetry={() => void refetch()} />;
  if (!invoice) return null;
  return (
    <Detail label="Invoice">
      <Link to={`/invoices/${invoice.id}`} className="link num text-[13px]">
        {invoice.number ?? "Draft invoice"}
      </Link>
    </Detail>
  );
}
