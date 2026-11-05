import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { DataTable, type TableColumn } from "../../components/DataTable";
import { PageHeader } from "../../components/PageHeader";
import { formatDate } from "../../lib/dates";
import { price } from "../../lib/money";
import type { AddressChange } from "../../lib/useAddress";
import { InvoiceChip } from "../InvoiceChip";
import { NewInvoiceButton, NewInvoiceDialog } from "../panels";
import { useInvoices, type InvoiceRow, type ShowsAs } from "../queries";
import { SHOWN_AS, shownOrder } from "../status";

/** Each issued invoice's place in the order they were issued, so Number sorts that way, whatever the prefix (V22). */
function issueOrder(rows: InvoiceRow[] | undefined) {
  const issued = (rows ?? [])
    .filter((row) => row.issue_date !== null)
    .sort((a, b) => a.issue_date!.localeCompare(b.issue_date!) || a.id - b.id);
  return new Map(issued.map((row, place) => [row.id, place]));
}

function useColumns(rows: InvoiceRow[] | undefined) {
  const order = useMemo(() => issueOrder(rows), [rows]);
  return useMemo<TableColumn<InvoiceRow>[]>(
    () => [
      {
        id: "number",
        header: "Number",
        value: (row) => row.number,
        searchable: true,
        sortValue: (row) => order.get(row.id) ?? Number.MAX_SAFE_INTEGER,
        width: "w-[130px]",
        cell: (row) =>
          row.number ? (
            <span className="num text-[13px]">{row.number}</span>
          ) : (
            <span className="text-muted">Draft</span>
          ),
      },
      { id: "organization", header: "Organization", value: (row) => row.organization?.name, searchable: true },
      { id: "deal", header: "Deal", value: (row) => row.deal.name, searchable: true },
      {
        id: "status",
        header: "Status",
        value: (row) => row.shows_as,
        sortValue: (row) => shownOrder(row.shows_as),
        width: "w-[110px]",
        cell: (row) => <InvoiceChip shows={row.shows_as} />,
      },
      {
        id: "issued",
        header: "Issued",
        value: (row) => row.issue_date,
        numeric: true,
        width: "w-[120px]",
        cell: (row) => (row.issue_date ? formatDate(row.issue_date) : ""),
      },
      {
        id: "due",
        header: "Due",
        value: (row) => row.due_date,
        numeric: true,
        width: "w-[120px]",
        cell: (row) => (row.due_date ? formatDate(row.due_date) : ""),
      },
      {
        id: "total",
        header: "Total",
        value: (row) => row.total_cents,
        numeric: true,
        width: "w-[140px]",
        cell: (row) => price(row.total_cents),
      },
      {
        id: "owed",
        header: "Owed",
        value: (row) => row.owed_cents,
        numeric: true,
        width: "w-[140px]",
        cell: (row) => <span className={row.owed_cents === 0 ? "text-muted" : ""}>{price(row.owed_cents)}</span>,
      },
      // Searched, but not a column (V22).
      { id: "bill_to", header: "Bill to", value: (row) => row.bill_to, searchable: true, hidden: true },
    ],
    [order],
  );
}

/** The Invoices table (V22, V23), with a filter by what each shows as, kept in the address like Contacts' (T6). */
export function Invoices() {
  const invoices = useInvoices();
  const [params] = useSearchParams();
  const [asking, setAsking] = useState(false);
  const shows = SHOWN_AS.find((item) => item.key === params.get("status"))?.key ?? null;
  const rows = useMemo(
    () => (shows ? invoices.data?.filter((row) => row.shows_as === shows) : invoices.data),
    [invoices.data, shows],
  );
  const columns = useColumns(invoices.data);

  const count = (wanted: ShowsAs | null) =>
    (invoices.data ?? []).filter((row) => wanted === null || row.shows_as === wanted).length;
  const options: { key: ShowsAs | null; label: string }[] = [{ key: null, label: "All" }, ...SHOWN_AS];

  const filters = (update: (change: AddressChange) => void): ReactNode => (
    <div role="group" aria-label="Filter by status" className="flex gap-1 rounded-control bg-panel p-1">
      {options.map((option) => {
        const on = option.key === shows;
        return (
          <button
            key={option.key ?? "all"}
            type="button"
            aria-pressed={on}
            onClick={() =>
              update((address) => {
                if (option.key) address.set("status", option.key);
                else address.delete("status");
                address.delete("page");
              })
            }
            className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-semibold whitespace-nowrap ${on ? "bg-sea-green text-midnight" : "hover:bg-page"}`}
          >
            {option.label}
            {invoices.data && <span className="num font-normal">{count(option.key)}</span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <PageHeader title="Invoices">
        <NewInvoiceButton />
      </PageHeader>
      <DataTable
        noun="invoice"
        rows={rows}
        error={invoices.error}
        onRetry={() => invoices.refetch()}
        columns={columns}
        defaultSort={{ id: "issued", desc: true }}
        rowId={(row) => row.id}
        rowName={(row) => row.number ?? "Draft"}
        rowHref={(row) => `/invoices/${row.id}`}
        onAdd={() => setAsking(true)}
        invitation={{ message: "No invoices yet. Start one from a won deal.", button: "New invoice" }}
        filters={filters}
        filtered={shows !== null}
        clearParams={["status"]}
      />
      {asking && <NewInvoiceDialog onClose={() => setAsking(false)} />}
    </>
  );
}
