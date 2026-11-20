import { useState } from "react";
import { Plus } from "lucide-react";
import { useOrganizations } from "@/api/organizations";
import type { OrganizationRow } from "@/api/types";
import { DataTable, NameLink, type TableColumn } from "@/components/DataTable";
import { DeleteDialog, type DeleteTarget } from "@/components/DeleteDialog";
import { OrganizationForm } from "@/components/forms/OrganizationForm";
import { Band } from "@/components/layout/Band";
import { PageBody } from "@/components/layout/PageBody";
import { Button } from "@/components/ui/button";
import { WebsiteLink } from "@/components/links";
import { money, plural } from "@/lib/format";

const columns: TableColumn<OrganizationRow>[] = [
  {
    id: "name",
    header: "Name",
    cell: (org) => <NameLink to={`/organizations/${org.id}`}>{org.name}</NameLink>,
    sortValue: (org) => org.name,
  },
  { id: "industry", header: "Industry", cell: (org) => org.industry, sortValue: (org) => org.industry },
  { id: "website", header: "Website", cell: (org) => <WebsiteLink website={org.website} />, sortValue: (org) => org.website },
  { id: "contacts", header: "Contacts", cell: (org) => org.contact_count, sortValue: (org) => org.contact_count, numeric: true },
  { id: "open_deals", header: "Open deals", cell: (org) => org.open_deal_count, sortValue: (org) => org.open_deal_count, numeric: true },
  {
    id: "open_pipeline",
    header: "Open pipeline",
    cell: (org) => money(org.open_pipeline),
    sortValue: (org) => org.open_pipeline,
    numeric: true,
  },
];

export default function OrganizationsPage() {
  const organizations = useOrganizations();
  const [editing, setEditing] = useState<OrganizationRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const addButton = (
    <Button onClick={() => setEditing("new")}>
      <Plus /> Add organization
    </Button>
  );

  return (
    <>
      <title>Organizations · Accountable</title>
      <Band
        title="Organizations"
        subtitle={organizations.data ? plural(organizations.data.length, "organization") : " "}
        right={addButton}
      />
      <PageBody>
        <DataTable
          rows={organizations.data}
          columns={columns}
          searchFields={(org) => [org.name, org.industry, org.website]}
          searchLabel="Search organizations"
          noun="organization"
          initialSort={{ id: "name", desc: false }}
          hrefOf={(org) => `/organizations/${org.id}`}
          nameOf={(org) => org.name}
          onEdit={setEditing}
          onDelete={(org) => setDeleting({ kind: "organization", id: org.id, name: org.name })}
          emptyAction={addButton}
        />
      </PageBody>
      <OrganizationForm
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        organization={editing === "new" || editing === null ? undefined : editing}
      />
      <DeleteDialog target={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </>
  );
}
