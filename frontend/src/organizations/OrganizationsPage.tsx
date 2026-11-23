import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { DataTable, type TableColumn } from "../shared/DataTable";
import { DeleteRecord, type Deletable } from "../shared/DeleteRecord";
import { money, plural } from "../shared/format";
import { LoadError, Loading } from "../shared/Loading";
import { PageHeader } from "../shared/PageHeader";
import { SidePanel } from "../shared/SidePanel";
import { OrganizationForm } from "./OrganizationForm";
import { useOrganizations, type Organization, type OrganizationRow } from "./hooks";

export function OrganizationsPage() {
  const navigate = useNavigate();
  const query = useOrganizations();
  const [editing, setEditing] = useState<Organization | "new" | null>(null);
  const [deleting, setDeleting] = useState<Deletable | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const columns = useMemo<TableColumn<OrganizationRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        enableGlobalFilter: true,
        cell: ({ row }) => (
          <Link to={`/organizations/${row.original.id}`} onClick={(e) => e.stopPropagation()}>
            {row.original.name}
          </Link>
        ),
      },
      { accessorKey: "industry", header: "Industry", enableGlobalFilter: true },
      {
        accessorKey: "website",
        header: "Website",
        enableGlobalFilter: true,
        cell: ({ getValue }) => {
          const site = getValue<string | null>();
          return site ? (
            <a
              href={site}
              target="_blank"
              rel="noreferrer"
              className="muted"
              onClick={(e) => e.stopPropagation()}
            >
              {site.replace(/^https?:\/\//, "")}
            </a>
          ) : null;
        },
      },
      {
        accessorKey: "contact_count",
        header: "Contacts",
        meta: { numeric: true },
      },
      {
        accessorKey: "open_deal_count",
        header: "Open deals",
        meta: { numeric: true },
      },
      {
        accessorKey: "open_value",
        header: "Open pipeline",
        meta: { numeric: true },
        cell: ({ getValue }) => money(getValue<number>()),
      },
    ],
    [],
  );

  const items = query.data?.items ?? [];
  return (
    <>
      <PageHeader
        title="Organizations"
        summary={query.data ? plural(query.data.total, "organization") : " "}
        action={
          <button type="button" className="btn" onClick={() => setEditing("new")}>
            <Plus size={16} aria-hidden="true" />
            Add organization
          </button>
        }
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadError error={query.error} what="list of organizations" />
      ) : (
        <DataTable<OrganizationRow>
          data={items}
          columns={columns}
          noun={["organization", "organizations"]}
          rowName={(o) => o.name}
          initialSort={[{ id: "name", desc: false }]}
          onOpen={(o) => navigate(`/organizations/${o.id}`)}
          onEdit={(o) => setEditing(o)}
          onDelete={(o) => setDeleting({ kind: "organization", id: o.id, name: o.name })}
          onAdd={() => setEditing("new")}
          addLabel="Add organization"
        />
      )}
      <SidePanel
        title={editing === "new" ? "Add organization" : "Edit organization"}
        open={editing !== null}
        onClose={close}
      >
        {editing !== null && (
          <OrganizationForm
            organization={editing === "new" ? undefined : editing}
            onSaved={close}
            onCancel={close}
          />
        )}
      </SidePanel>
      {deleting && <DeleteRecord record={deleting} onClose={closeDelete} />}
    </>
  );
}
