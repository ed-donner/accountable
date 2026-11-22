import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { DataTable } from "../shared/DataTable";
import { DeleteRecord, type Deletable } from "../shared/DeleteRecord";
import { formatDate, plural } from "../shared/format";
import { LoadError, Loading } from "../shared/Loading";
import { PageHeader } from "../shared/PageHeader";
import { SidePanel } from "../shared/SidePanel";
import { STATUSES, type Status } from "../shared/stages";
import { ContactForm } from "./ContactForm";
import { StatusBadge } from "./StatusBadge";
import { useContacts, type Contact, type ContactRow } from "./hooks";

const FILTERS: { key: Status | null; label: string }[] = [{ key: null, label: "All" }, ...STATUSES];

export function ContactsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get("status");
  const status = STATUSES.some((s) => s.key === raw) ? (raw as Status) : null;
  const query = useContacts(status);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [deleting, setDeleting] = useState<Deletable | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const columns = useMemo<ColumnDef<ContactRow, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        enableGlobalFilter: true,
        cell: ({ row }) => (
          <Link to={`/contacts/${row.original.id}`} onClick={(e) => e.stopPropagation()}>
            {row.original.name}
          </Link>
        ),
      },
      { accessorKey: "organization_name", header: "Organization", enableGlobalFilter: true },
      { accessorKey: "job_title", header: "Job title", enableGlobalFilter: true },
      { accessorKey: "email", header: "Email", enableGlobalFilter: true },
      { accessorKey: "phone", header: "Phone", enableGlobalFilter: true, cell: ({ getValue }) => <span className="mono">{getValue<string>()}</span> },
      { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue<Status>()} /> },
      {
        accessorKey: "last_activity_on",
        header: "Last activity",
        meta: { numeric: true },
        cell: ({ getValue }) => formatDate(getValue<string | null>()),
      },
    ],
    [],
  );

  const counts = query.data?.status_counts;
  const filters = (
    <div className="filter-tabs" role="group" aria-label="Filter by status">
      {FILTERS.map((f) => (
        <button
          key={f.label}
          type="button"
          aria-pressed={status === f.key}
          onClick={() => setParams(f.key ? { status: f.key } : {})}
        >
          {f.label}
          <span className="count">{counts ? counts[f.key ?? "all"] : ""}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Contacts"
        summary={counts ? `${plural(counts.all, "contact")}: ${counts.lead} leads, ${counts.qualified} qualified, ${counts.customer} customers` : " "}
        action={
          <button type="button" className="btn" onClick={() => setEditing("new")}>
            <Plus size={16} aria-hidden="true" />
            Add contact
          </button>
        }
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadError error={query.error} what="list of contacts" />
      ) : (
        <DataTable<ContactRow>
          key={status ?? "all"}
          data={query.data.items}
          columns={columns}
          noun={["contact", "contacts"]}
          rowName={(c) => c.name}
          initialSort={[{ id: "name", desc: false }]}
          onOpen={(c) => navigate(`/contacts/${c.id}`)}
          onEdit={(c) => setEditing(c)}
          onDelete={(c) => setDeleting({ kind: "contact", id: c.id, name: c.name })}
          onAdd={() => setEditing("new")}
          addLabel="Add contact"
          filters={filters}
          emptyMessage={status ? `No ${STATUSES.find((s) => s.key === status)!.label.toLowerCase()} contacts yet.` : undefined}
        />
      )}
      <SidePanel title={editing === "new" ? "Add contact" : "Edit contact"} open={editing !== null} onClose={close}>
        {editing !== null && <ContactForm contact={editing === "new" ? undefined : editing} onSaved={close} onCancel={close} />}
      </SidePanel>
      {deleting && <DeleteRecord record={deleting} onClose={closeDelete} />}
    </>
  );
}
