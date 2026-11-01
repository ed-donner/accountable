import { useMemo, useState } from "react";

import { DataTable, type TableColumn } from "../../components/DataTable";
import { PageHeader } from "../../components/PageHeader";
import { formatDate } from "../../lib/dates";
import { money } from "../../lib/money";
import { DeleteOrganization } from "../forms/DeleteDialogs";
import { OrganizationForm } from "../forms/OrganizationForm";
import { useOrganizations, type OrganizationRow } from "../queries";

export function Organizations() {
  const organizations = useOrganizations();
  const [editing, setEditing] = useState<OrganizationRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<OrganizationRow | null>(null);

  const columns = useMemo<TableColumn<OrganizationRow>[]>(
    () => [
      { id: "name", header: "Name", value: (row) => row.name, searchable: true },
      { id: "industry", header: "Industry", value: (row) => row.industry, searchable: true },
      {
        id: "website",
        header: "Website",
        value: (row) => row.website,
        searchable: true,
        cell: (row) =>
          row.website && (
            <a
              href={row.website}
              target="_blank"
              rel="noreferrer"
              className="link"
              onClick={(event) => event.stopPropagation()}
            >
              {row.website.replace(/^https?:\/\//i, "")}
            </a>
          ),
      },
      { id: "contacts", header: "Contacts", value: (row) => row.contact_count, numeric: true, width: "w-[100px]" },
      { id: "open_deals", header: "Open deals", value: (row) => row.open_deal_count, numeric: true, width: "w-[110px]" },
      {
        id: "open_value",
        header: "Open value",
        value: (row) => row.open_value,
        numeric: true,
        width: "w-[120px]",
        cell: (row) => money(row.open_value),
      },
      {
        id: "last_activity",
        header: "Last activity",
        value: (row) => row.last_activity,
        numeric: true,
        width: "w-[130px]",
        cell: (row) => (row.last_activity ? formatDate(row.last_activity) : ""),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Organizations">
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          Add organization
        </button>
      </PageHeader>
      <DataTable
        noun="organization"
        rows={organizations.data}
        error={organizations.error}
        onRetry={() => organizations.refetch()}
        columns={columns}
        defaultSort={{ id: "name", desc: false }}
        rowId={(row) => row.id}
        rowName={(row) => row.name}
        rowHref={(row) => `/organizations/${row.id}`}
        onAdd={() => setEditing("new")}
        onEdit={setEditing}
        onDelete={setDeleting}
      />
      {editing && (
        <OrganizationForm record={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />
      )}
      {deleting && <DeleteOrganization id={deleting.id} name={deleting.name} onClose={() => setDeleting(null)} />}
    </>
  );
}
