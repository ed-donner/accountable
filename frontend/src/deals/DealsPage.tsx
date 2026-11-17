import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { DataTable } from "../shared/DataTable";
import { DeleteRecord, type Deletable } from "../shared/DeleteRecord";
import { formatDate, money, plural } from "../shared/format";
import { LateBadge } from "../shared/LateBadge";
import { LoadError, Loading } from "../shared/Loading";
import { PageHeader } from "../shared/PageHeader";
import { SidePanel } from "../shared/SidePanel";
import { STAGES, stageLabel, type Stage } from "../shared/stages";
import { DealForm } from "./DealForm";
import { StagePill } from "./StagePill";
import { useDeals, type DealRow } from "./hooks";

const STAGE_ORDER = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));

export function DealsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get("stage");
  const stage = STAGES.some((s) => s.key === raw) ? (raw as Stage) : null;
  const query = useDeals(stage);
  const [editing, setEditing] = useState<DealRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<Deletable | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const columns = useMemo<ColumnDef<DealRow, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        enableGlobalFilter: true,
        cell: ({ row }) => (
          <span className="name-cell">
            <Link to={`/deals/${row.original.id}`} onClick={(e) => e.stopPropagation()}>
              {row.original.name}
            </Link>
            <LateBadge late={row.original.is_late} />
          </span>
        ),
      },
      { accessorKey: "organization_name", header: "Organization", enableGlobalFilter: true },
      { accessorKey: "contact_name", header: "Main contact", enableGlobalFilter: true },
      {
        id: "stage",
        accessorFn: (d) => STAGE_ORDER[d.stage],
        header: "Stage",
        cell: ({ row }) => <StagePill stage={row.original.stage} />,
      },
      { accessorKey: "value", header: "Value", meta: { numeric: true }, cell: ({ getValue }) => money(getValue<number>()) },
      { accessorKey: "probability", header: "Probability", meta: { numeric: true }, cell: ({ getValue }) => `${getValue<number>()}%` },
      {
        accessorKey: "expected_revenue",
        header: "Expected",
        meta: { numeric: true },
        cell: ({ getValue }) => money(getValue<number>()),
      },
      { accessorKey: "close_date", header: "Close date", meta: { numeric: true }, cell: ({ getValue }) => formatDate(getValue<string | null>()) },
    ],
    [],
  );

  const total = query.data?.total ?? 0;
  const filter = (
    <label className="stage-filter">
      <span className="sr-only">Filter by stage</span>
      <select className="filter-select" value={stage ?? ""} onChange={(e) => setParams(e.target.value ? { stage: e.target.value } : {})}>
        <option value="">All stages</option>
        {STAGES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <PageHeader
        title="Deals"
        summary={query.data ? (stage ? `${plural(total, "deal")} in ${stageLabel(stage)}` : plural(total, "deal")) : " "}
        action={
          <button type="button" className="btn" onClick={() => setEditing("new")}>
            <Plus size={16} aria-hidden="true" />
            Add deal
          </button>
        }
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadError error={query.error} what="list of deals" />
      ) : (
        <DataTable<DealRow>
          key={stage ?? "all"}
          data={query.data.items}
          columns={columns}
          noun={["deal", "deals"]}
          rowName={(d) => d.name}
          initialSort={stage === "won" || stage === "lost" ? [{ id: "close_date", desc: true }] : [{ id: "name", desc: false }]}
          onOpen={(d) => navigate(`/deals/${d.id}`)}
          onEdit={(d) => setEditing(d)}
          onDelete={(d) => setDeleting({ kind: "deal", id: d.id, name: d.name })}
          onAdd={() => setEditing("new")}
          addLabel="Add deal"
          filters={filter}
          emptyMessage={stage ? `No deals at this stage yet.` : undefined}
        />
      )}
      <SidePanel title={editing === "new" ? "Add deal" : "Edit deal"} open={editing !== null} onClose={close}>
        {editing !== null && (
          <DealForm
            deal={editing === "new" ? undefined : editing}
            preset={{ stage: stage ?? undefined }}
            onSaved={close}
            onCancel={close}
          />
        )}
      </SidePanel>
      {deleting && <DeleteRecord record={deleting} onClose={closeDelete} />}
    </>
  );
}
