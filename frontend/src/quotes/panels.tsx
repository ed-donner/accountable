import { Plus } from "lucide-react";
import { Link } from "react-router";

import { LinkedList, SidePanel, type RecordPanel } from "../components/RecordLayout";
import { LoadFailed } from "../components/LoadFailed";
import { isOpen } from "../crm/deals";
import type { DealDetail, OrganizationDetail } from "../crm/queries";
import { price } from "../lib/money";
import { useToday } from "../lib/useToday";
import { useQuotes, type QuoteFilter, type QuoteRow } from "./queries";
import { shownStatus } from "./status";
import { QuoteStatusChip } from "./StatusChip";

type ListProps = {
  filter: QuoteFilter;
  /** The deal's name under each quote, on an organization's panel, whose quotes come from several deals. */
  withDeal?: boolean;
};

/** The quotes, newest first, each with its number, status chip and value, opening its page (Q36, Q37). */
function QuoteList({ filter, withDeal }: ListProps) {
  const quotes = useQuotes(filter);
  const today = useToday();
  if (!quotes.data) return <LoadFailed error={quotes.error} onRetry={() => quotes.refetch()} />;
  const value = (row: QuoteRow) => <span className="num">{price(row.subtotal_cents)}</span>;
  return (
    <LinkedList
      empty="No quotes yet."
      items={quotes.data.map((row) => ({
        key: row.id,
        to: `/quotes/${row.id}`,
        // A number, so in JetBrains Mono, as it is in the table and on the quote (Q33).
        name: <span className="num">{row.number}</span>,
        hint: withDeal ? (
          <>
            {row.deal_name} · {value(row)}
          </>
        ) : (
          value(row)
        ),
        end: <QuoteStatusChip status={shownStatus(row, today)} />,
      }))}
    />
  );
}

function DealQuotes({ record }: { record: DealDetail }) {
  const open = isOpen(record.stage);
  const newQuote = open && (
    <Link to={`/quotes/new?deal=${record.id}`} className="btn btn-secondary h-8 px-2.5">
      <Plus size={15} aria-hidden="true" />
      New quote
    </Link>
  );
  return (
    <SidePanel title="Quotes" action={newQuote}>
      <QuoteList filter={{ deal_id: record.id }} />
      {!open && (
        <p className="mt-1 text-[13px] leading-[18px] text-muted">Quotes can be added while the deal is open.</p>
      )}
    </SidePanel>
  );
}

/** A quote starts from a deal, so an organization's panel has no New quote (Q37). */
function OrganizationQuotes({ record }: { record: OrganizationDetail }) {
  return (
    <SidePanel title="Quotes">
      <QuoteList filter={{ organization_id: record.id }} withDeal />
    </SidePanel>
  );
}

export const dealQuotesPanel: RecordPanel<DealDetail> = { name: "quotes", Panel: DealQuotes };
export const organizationQuotesPanel: RecordPanel<OrganizationDetail> = { name: "quotes", Panel: OrganizationQuotes };
