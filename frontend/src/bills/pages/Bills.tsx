import { CircleCheck, Undo2 } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import {
  DataTable,
  type FilterNote,
  type RowAction,
  type TableColumn,
  type TableHandle,
} from "../../components/DataTable";
import { PageHeader } from "../../components/PageHeader";
import { formatDate } from "../../lib/dates";
import { price } from "../../lib/money";
import type { AddressChange } from "../../lib/useAddress";
import { useToday } from "../../lib/useToday";
import { plural } from "../../lib/words";
import { BillForm } from "../BillForm";
import { CategoryLabel, categoryPlace, categoryStyle } from "../categories";
import { DeleteBill } from "../DeleteBill";
import { MarkPaidDialog } from "../MarkPaidDialog";
import { useBills, usePaid, type BillRow } from "../queries";
import { BillStatusChip, STATUSES, STATUS_LABELS, billStatus, type BillStatus } from "../status";

type Filter = "all" | BillStatus;

/** In the order the filter shows them (E14). */
const FILTERS: Filter[] = ["all", "unpaid", "overdue", "paid"];
const FILTER_LABELS: Record<Filter, string> = { all: "All", ...STATUS_LABELS };

/** The filter in the address, as status. With none, it's Unpaid, which the section opens on (E14). */
function readFilter(value: string | null): Filter {
  return FILTERS.find((filter) => filter === value) ?? "unpaid";
}

/** Unpaid includes the overdue bills, because they're unpaid too. */
function isUnder(filter: Filter, status: BillStatus) {
  if (filter === "all") return true;
  return filter === "unpaid" ? status !== "paid" : status === filter;
}

/** What a filter that leaves out every bill says (E15). */
function filterNote(filter: Exclude<Filter, "all">, all: BillRow[] | undefined): FilterNote<BillRow> {
  const words = `${STATUS_LABELS[filter].toLowerCase()} bills`;
  return {
    all,
    none: `No ${words}.`,
    words,
    matchUnderAll: (count) => `${plural(count, "bill")} ${count === 1 ? "matches" : "match"} under All.`,
    showAll: (address) => address.set("status", "all"),
  };
}

function inMono(text: string) {
  return <span className="num text-[13px]">{text}</span>;
}

/** The status depends on today, so the columns are made again when the day changes (E8). */
function billColumns(today: string): TableColumn<BillRow>[] {
  return [
    { id: "supplier", header: "Supplier", value: (row) => row.organization.name, searchable: true },
    {
      id: "bill_number",
      header: "Bill number",
      value: (row) => row.bill_number,
      searchable: true,
      width: "w-[150px]",
      cell: (row) => inMono(row.bill_number),
    },
    {
      id: "category",
      header: "Category",
      value: (row) => categoryStyle(row.category).label,
      searchable: true,
      sortValue: (row) => categoryPlace(row.category),
      width: "w-[140px]",
      cell: (row) => <CategoryLabel category={row.category} />,
    },
    {
      id: "bill_date",
      header: "Bill date",
      value: (row) => row.bill_date,
      width: "w-[124px]",
      cell: (row) => inMono(formatDate(row.bill_date)),
    },
    {
      id: "due_date",
      header: "Due date",
      value: (row) => row.due_date,
      width: "w-[124px]",
      cell: (row) => inMono(formatDate(row.due_date)),
    },
    {
      id: "total",
      header: "Total",
      value: (row) => row.total_cents,
      numeric: true,
      width: "w-[150px]",
      cell: (row) => price(row.total_cents),
    },
    {
      id: "status",
      header: "Status",
      value: (row) => STATUS_LABELS[billStatus(row, today)],
      sortValue: (row) => STATUSES.indexOf(billStatus(row, today)),
      width: "w-[110px]",
      cell: (row) => <BillStatusChip status={billStatus(row, today)} />,
    },
  ];
}

type FilterButtonsProps = {
  filter: Filter;
  counts: Record<Filter, number> | null;
  update: (change: AddressChange) => void;
};

function FilterButtons({ filter, counts, update }: FilterButtonsProps) {
  function choose(option: Filter) {
    update((address) => {
      if (option === "unpaid") address.delete("status");
      else address.set("status", option);
      address.delete("page");
    });
  }

  return (
    <div role="group" aria-label="Filter by status" className="flex gap-1 rounded-control bg-panel p-1">
      {FILTERS.map((option) => {
        const on = option === filter;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => choose(option)}
            className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-semibold ${on ? "bg-sea-green text-midnight" : "hover:bg-page"}`}
          >
            {FILTER_LABELS[option]}
            {counts && <span className="num font-normal"> ({counts[option]})</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Bills() {
  const bills = useBills();
  const today = useToday();
  const { markUnpaid } = usePaid();
  const [params] = useSearchParams();
  const table = useRef<TableHandle>(null);
  const [editing, setEditing] = useState<BillRow | "new" | null>(null);
  const [paying, setPaying] = useState<BillRow | null>(null);
  const [deleting, setDeleting] = useState<BillRow | null>(null);

  const filter = readFilter(params.get("status"));
  const rows = useMemo(
    () => bills.data?.filter((bill) => isUnder(filter, billStatus(bill, today))),
    [bills.data, filter, today],
  );
  const columns = useMemo(() => billColumns(today), [today]);

  const counts = useMemo(() => {
    if (!bills.data) return null;
    const statuses = bills.data.map((bill) => billStatus(bill, today));
    const count = (option: Filter) => statuses.filter((status) => isUnder(option, status)).length;
    return Object.fromEntries(FILTERS.map((option) => [option, count(option)])) as Record<Filter, number>;
  }, [bills.data, today]);

  function payOrUnpay(bill: BillRow): RowAction {
    const paidOn = bill.paid_on;
    if (paidOn === null) {
      return { label: "Mark paid", icon: <CircleCheck size={16} aria-hidden="true" />, onClick: () => setPaying(bill) };
    }
    return {
      label: "Mark unpaid",
      icon: <Undo2 size={16} aria-hidden="true" />,
      onClick: () => void markUnpaid(bill.id, paidOn),
    };
  }

  const filters = (update: (change: AddressChange) => void): ReactNode => (
    <FilterButtons filter={filter} counts={counts} update={update} />
  );

  return (
    <>
      <PageHeader title="Bills">
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          Add bill
        </button>
      </PageHeader>
      <DataTable
        ref={table}
        noun="bill"
        rows={rows}
        error={bills.error}
        onRetry={() => bills.refetch()}
        columns={columns}
        defaultSort={{ id: "due_date", desc: false }}
        rowId={(row) => row.id}
        rowName={(row) => `bill ${row.bill_number} from ${row.organization.name}`}
        rowHref={(row) => `/bills/${row.id}`}
        onAdd={() => setEditing("new")}
        onEdit={setEditing}
        rowAction={payOrUnpay}
        onDelete={setDeleting}
        filters={filters}
        filterNote={filter === "all" ? undefined : filterNote(filter, bills.data)}
      />
      {editing && <BillForm record={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {paying && (
        <MarkPaidDialog
          bill={paying}
          onClose={() => setPaying(null)}
          onOpenerGone={() => table.current?.focusSearch()}
        />
      )}
      {deleting && <DeleteBill bill={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}
