import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { DataTable, type EmptyWords, type TableColumn } from "../../components/DataTable";
import { PageHeader } from "../../components/PageHeader";
import { formatDate } from "../../lib/dates";
import { price } from "../../lib/money";
import type { AddressChange } from "../../lib/useAddress";
import { useToday } from "../../lib/useToday";
import { NewQuoteDialog } from "../dialogs";
import { useQuotes, type QuoteRow } from "../queries";
import { STATUS_NAMES, STATUS_ORDER, figures, shownStatus, type Figure, type ShownStatus } from "../status";
import { QuoteStatusChip } from "../StatusChip";

const NONE = <span className="text-muted">None</span>;

function columnsFor(today: string): TableColumn<QuoteRow>[] {
  return [
    {
      id: "number",
      header: "Number",
      value: (row) => row.number,
      searchable: true,
      // In the order the numbers were taken, so QT-10000 comes after QT-9999, whatever the prefix was.
      sortValue: (row) => row.id,
      width: "w-[120px]",
      cell: (row) => <span className="num text-[13px]">{row.number}</span>,
    },
    { id: "deal", header: "Deal", value: (row) => row.deal_name, searchable: true },
    {
      id: "organization",
      header: "Organization",
      value: (row) => row.organization_name,
      searchable: true,
      cell: (row) => row.organization_name ?? NONE,
    },
    {
      id: "status",
      header: "Status",
      value: (row) => STATUS_NAMES[shownStatus(row, today)],
      searchable: true,
      sortValue: (row) => STATUS_ORDER.indexOf(shownStatus(row, today)),
      width: "w-[110px]",
      cell: (row) => <QuoteStatusChip status={shownStatus(row, today)} />,
    },
    {
      id: "value",
      header: "Value",
      value: (row) => row.subtotal_cents,
      numeric: true,
      width: "w-[140px]",
      cell: (row) => price(row.subtotal_cents),
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
      id: "date",
      header: "Date",
      value: (row) => row.quote_date,
      numeric: true,
      width: "w-[120px]",
      cell: (row) => formatDate(row.quote_date),
    },
    {
      id: "valid_until",
      header: "Valid until",
      value: (row) => row.valid_until,
      numeric: true,
      width: "w-[120px]",
      cell: (row) => formatDate(row.valid_until),
    },
  ];
}

type FiguresProps = {
  shown: Record<ShownStatus | "all", Figure> | null;
  status: ShownStatus | null;
  update: (change: AddressChange) => void;
};

/** The count and value of every quote and each status, whatever the search, each also a filter (Q34). */
function Figures({ shown, status, update }: FiguresProps) {
  const options: (ShownStatus | null)[] = [null, ...STATUS_ORDER];
  return (
    <div role="group" aria-label="Filter by status" className="panel grid grid-cols-6 gap-1 p-1.5">
      {options.map((option) => {
        const on = option === status;
        const figure = shown?.[option ?? "all"];
        return (
          <button
            key={option ?? "all"}
            type="button"
            aria-pressed={on}
            onClick={() =>
              update((address) => {
                if (option) address.set("status", option);
                else address.delete("status");
                address.delete("page");
              })
            }
            className={`flex min-w-0 flex-col items-start rounded-card px-3 py-2 text-left ${on ? "bg-sea-green text-midnight" : "hover:bg-page"}`}
          >
            <span className="flex w-full items-baseline justify-between gap-2 text-[13px] leading-[18px] font-semibold">
              {option ? STATUS_NAMES[option] : "All"}
              {figure && <span className="num font-normal">{figure.count}</span>}
            </span>
            <span className="num h-[30px] max-w-full truncate text-[24px] leading-[30px] font-medium tracking-[-0.02em]">
              {figure && price(figure.value_cents)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const EMPTY: EmptyWords = { none: "No quotes yet. Add the first one from an open deal.", add: "New quote" };

/** The Quotes section: the figures, then the table, with New quote asking which open deal first (Q8, Q33 to Q35). */
export function Quotes() {
  const quotes = useQuotes();
  const today = useToday();
  const [params] = useSearchParams();
  const [choosing, setChoosing] = useState(false);
  const status = STATUS_ORDER.find((item) => item === params.get("status")) ?? null;

  const columns = useMemo(() => columnsFor(today), [today]);
  const rows = useMemo(
    () => (status ? quotes.data?.filter((row) => shownStatus(row, today) === status) : quotes.data),
    [quotes.data, status, today],
  );
  const shown = useMemo(() => (quotes.data ? figures(quotes.data, today) : null), [quotes.data, today]);
  const empty: EmptyWords = status
    ? {
        ...EMPTY,
        filtered: { message: `No ${STATUS_NAMES[status].toLowerCase()} quotes.`, showAll: "Show all quotes" },
      }
    : EMPTY;

  return (
    <>
      <PageHeader title="Quotes">
        <button type="button" className="btn btn-primary" onClick={() => setChoosing(true)}>
          New quote
        </button>
      </PageHeader>
      <DataTable
        noun="quote"
        rows={rows}
        error={quotes.error}
        onRetry={() => quotes.refetch()}
        columns={columns}
        defaultSort={{ id: "number", desc: true }}
        rowId={(row) => row.id}
        rowName={(row) => row.number}
        rowHref={(row) => `/quotes/${row.id}`}
        onAdd={() => setChoosing(true)}
        summary={(update) => <Figures shown={shown} status={status} update={update} />}
        filtered={status !== null}
        clearParams={["status"]}
        empty={empty}
      />
      {choosing && <NewQuoteDialog onClose={() => setChoosing(false)} />}
    </>
  );
}
