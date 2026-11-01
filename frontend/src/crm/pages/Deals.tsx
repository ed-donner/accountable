import { X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { Chip } from "../../components/Chip";
import { DataTable, type TableColumn } from "../../components/DataTable";
import { PageHeader } from "../../components/PageHeader";
import { formatDate } from "../../lib/dates";
import { money } from "../../lib/money";
import type { AddressChange } from "../../lib/useAddress";
import { useToday } from "../../lib/useToday";
import { STAGES, STAGE_NAMES, isLate } from "../deals";
import { DealForm } from "../forms/DealForm";
import { DeleteDeal } from "../forms/DeleteDialogs";
import { useDeals, type Deal } from "../queries";
import { StageChip } from "../StageChip";

const none = <span className="text-muted">None</span>;

export function Deals() {
  const deals = useDeals();
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<Deal | "new" | null>(null);
  const [deleting, setDeleting] = useState<Deal | null>(null);
  const today = useToday();

  // Only the dashboard's won links set this, so it only shows after following one.
  const stage = STAGES.find((item) => item === params.get("stage")) ?? null;

  const rows = useMemo(
    () => (stage ? deals.data?.filter((row) => row.stage === stage) : deals.data),
    [deals.data, stage],
  );

  const columns = useMemo<TableColumn<Deal>[]>(
    () => [
      { id: "name", header: "Name", value: (row) => row.name, searchable: true },
      {
        id: "organization",
        header: "Organization",
        value: (row) => row.organization_name,
        searchable: true,
        cell: (row) => row.organization_name ?? none,
      },
      {
        id: "main_contact",
        header: "Main contact",
        value: (row) => row.main_contact_name,
        searchable: true,
        cell: (row) => row.main_contact_name ?? none,
      },
      {
        id: "stage",
        header: "Stage",
        value: (row) => STAGE_NAMES[row.stage],
        searchable: true,
        sortValue: (row) => STAGES.indexOf(row.stage),
        width: "w-[120px]",
        cell: (row) => <StageChip stage={row.stage} />,
      },
      {
        id: "value",
        header: "Value",
        value: (row) => row.value,
        numeric: true,
        width: "w-[110px]",
        cell: (row) => money(row.value),
      },
      {
        id: "probability",
        header: "Probability",
        value: (row) => row.probability,
        numeric: true,
        width: "w-[110px]",
        cell: (row) => `${row.probability}%`,
      },
      {
        id: "expected",
        header: "Expected revenue",
        value: (row) => (["won", "lost"].includes(row.stage) ? null : row.expected_revenue),
        numeric: true,
        width: "w-[150px]",
        cell: (row) => (["won", "lost"].includes(row.stage) ? "" : money(row.expected_revenue)),
      },
      {
        id: "close_date",
        header: "Close date",
        value: (row) => row.close_date,
        numeric: true,
        width: "w-[176px]",
        cell: (row) => (
          <span className="inline-flex items-center gap-2">
            {isLate(row, today) && <Chip tone="alert">Late</Chip>}
            {formatDate(row.close_date)}
          </span>
        ),
      },
    ],
    [today],
  );

  const filters = (update: (change: AddressChange) => void): ReactNode =>
    stage && (
      <button
        type="button"
        className="btn btn-secondary bg-panel"
        aria-label="Show every stage"
        onClick={() =>
          update((address) => {
            address.delete("stage");
            address.delete("page");
          })
        }
      >
        {STAGE_NAMES[stage]} deals only
        <X size={14} aria-hidden="true" />
      </button>
    );

  return (
    <>
      <PageHeader title="Deals">
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          Add deal
        </button>
      </PageHeader>
      <DataTable
        noun="deal"
        rows={rows}
        error={deals.error}
        onRetry={() => deals.refetch()}
        columns={columns}
        defaultSort={{ id: "close_date", desc: false }}
        rowId={(row) => row.id}
        rowName={(row) => row.name}
        rowHref={(row) => `/deals/${row.id}`}
        onAdd={() => setEditing("new")}
        onEdit={setEditing}
        onDelete={setDeleting}
        filters={filters}
        filtered={stage !== null}
        clearParams={["stage"]}
      />
      {editing && <DealForm record={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteDeal id={deleting.id} name={deleting.name} onClose={() => setDeleting(null)} />}
    </>
  );
}
