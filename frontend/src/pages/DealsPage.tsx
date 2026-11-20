import { useState } from "react";
import { Plus } from "lucide-react";
import { useDeals } from "@/api/deals";
import type { Deal } from "@/api/types";
import { LateBadge, StageBadge } from "@/components/Badges";
import { DataTable, NameLink, type TableColumn } from "@/components/DataTable";
import { DeleteDialog, type DeleteTarget } from "@/components/DeleteDialog";
import { DealForm } from "@/components/forms/DealForm";
import { Band } from "@/components/layout/Band";
import { PageBody } from "@/components/layout/PageBody";
import { RecordLink } from "@/components/links";
import { Button } from "@/components/ui/button";
import { formatDate, money, percent, plural } from "@/lib/format";
import { STAGES, STAGE_NAMES } from "@/lib/rules";

const columns: TableColumn<Deal>[] = [
  { id: "name", header: "Name", cell: (deal) => <NameLink to={`/deals/${deal.id}`}>{deal.name}</NameLink>, sortValue: (deal) => deal.name },
  {
    id: "organization",
    header: "Organization",
    cell: (deal) => <RecordLink to={`/organizations/${deal.organization.id}`}>{deal.organization.name}</RecordLink>,
    sortValue: (deal) => deal.organization.name,
  },
  {
    id: "main_contact",
    header: "Main contact",
    cell: (deal) =>
      deal.main_contact && <RecordLink to={`/contacts/${deal.main_contact.id}`}>{deal.main_contact.name}</RecordLink>,
    sortValue: (deal) => deal.main_contact?.name ?? null,
  },
  { id: "stage", header: "Stage", cell: (deal) => <StageBadge stage={deal.stage} />, sortValue: (deal) => STAGES.indexOf(deal.stage) },
  { id: "value", header: "Value", cell: (deal) => money(deal.value), sortValue: (deal) => deal.value, numeric: true },
  { id: "probability", header: "Probability", cell: (deal) => percent(deal.probability), sortValue: (deal) => deal.probability, numeric: true },
  {
    id: "expected",
    header: "Expected revenue",
    cell: (deal) => money(deal.expected_value),
    sortValue: (deal) => deal.expected_value,
    numeric: true,
  },
  {
    id: "close_date",
    header: "Close date",
    cell: (deal) => (
      <span className="inline-flex items-center justify-end gap-2">
        {deal.is_late && <LateBadge />}
        <span className={deal.is_late ? "text-raspberry-text" : undefined}>{formatDate(deal.close_date)}</span>
      </span>
    ),
    sortValue: (deal) => deal.close_date,
    numeric: true,
  },
];

export default function DealsPage() {
  const deals = useDeals();
  const [editing, setEditing] = useState<Deal | "new" | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const addButton = (
    <Button onClick={() => setEditing("new")}>
      <Plus /> Add deal
    </Button>
  );

  return (
    <>
      <title>Deals · Accountable</title>
      <Band title="Deals" subtitle={deals.data ? plural(deals.data.length, "deal") : " "} right={addButton} />
      <PageBody>
        <DataTable
          rows={deals.data}
          columns={columns}
          searchFields={(deal) => [deal.name, deal.organization.name, deal.main_contact?.name, STAGE_NAMES[deal.stage]]}
          searchLabel="Search deals"
          noun="deal"
          initialSort={{ id: "close_date", desc: false }}
          hrefOf={(deal) => `/deals/${deal.id}`}
          nameOf={(deal) => deal.name}
          onEdit={setEditing}
          onDelete={(deal) => setDeleting({ kind: "deal", id: deal.id, name: deal.name })}
          emptyAction={addButton}
        />
      </PageBody>
      <DealForm
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        deal={editing === "new" || editing === null ? undefined : editing}
      />
      <DeleteDialog target={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </>
  );
}
