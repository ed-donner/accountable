import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { LoadFailed } from "../../components/LoadFailed";
import { MissingRecord } from "../../components/MissingRecord";
import { ApiError } from "../../lib/api";
import { money } from "../../lib/money";
import { recordId } from "../../lib/validate";
import { ContactForm } from "../forms/ContactForm";
import { DealForm } from "../forms/DealForm";
import { DeleteOrganization } from "../forms/DeleteDialogs";
import { OrganizationForm } from "../forms/OrganizationForm";
import { useOrganization } from "../queries";
import { StageChip, StatusChip } from "../StageChip";
import { Timeline } from "../Timeline";
import { Detail, LinkedList, NONE, RecordColumns, RecordHeader, SidePanel } from "../RecordLayout";

export function Organization() {
  const id = recordId(useParams().id);
  if (id === null) return <MissingRecord word="organization" to="/organizations" section="Organizations" />;
  return <OrganizationRecord id={id} />;
}

function OrganizationRecord({ id }: { id: number }) {
  const navigate = useNavigate();
  const organization = useOrganization(id);
  const [dialog, setDialog] = useState<"edit" | "delete" | "contact" | "deal" | null>(null);
  const close = () => setDialog(null);

  if (organization.error instanceof ApiError && organization.error.kind === "missing") {
    return <MissingRecord word="organization" to="/organizations" section="Organizations" />;
  }
  if (!organization.data)
    return <LoadFailed onPage error={organization.error} onRetry={() => organization.refetch()} />;
  const record = organization.data;

  return (
    <>
      <RecordHeader title={record.name} onEdit={() => setDialog("edit")} onDelete={() => setDialog("delete")} />
      <LoadFailed onPage keeping error={organization.error} onRetry={() => organization.refetch()} />
      <RecordColumns
        side={
          <>
            <SidePanel title="Details">
              <dl>
                <Detail label="Website">
                  {record.website ? (
                    <a href={record.website} target="_blank" rel="noreferrer" className="link">
                      {record.website.replace(/^https?:\/\//i, "")}
                    </a>
                  ) : (
                    NONE
                  )}
                </Detail>
                <Detail label="Industry">{record.industry ?? NONE}</Detail>
              </dl>
              {record.notes && <p className="mt-2 whitespace-pre-wrap text-muted">{record.notes}</p>}
            </SidePanel>
            <SidePanel
              title="Contacts"
              action={
                <button type="button" className="btn btn-secondary" onClick={() => setDialog("contact")}>
                  Add contact
                </button>
              }
            >
              <LinkedList
                empty="No contacts yet."
                items={record.contacts.map((contact) => ({
                  key: contact.id,
                  to: `/contacts/${contact.id}`,
                  name: contact.name,
                  hint: contact.job_title,
                  end: <StatusChip status={contact.status} />,
                }))}
              />
            </SidePanel>
            <SidePanel
              title="Deals"
              action={
                <button type="button" className="btn btn-secondary" onClick={() => setDialog("deal")}>
                  Add deal
                </button>
              }
            >
              <LinkedList
                empty="No deals yet."
                items={record.deals.map((deal) => ({
                  key: deal.id,
                  to: `/deals/${deal.id}`,
                  name: deal.name,
                  hint: <span className="num text-[12px]">{money(deal.value)}</span>,
                  end: <StageChip stage={deal.stage} />,
                }))}
              />
            </SidePanel>
          </>
        }
      >
        <Timeline key={id} kind="organizations" id={id} empty="Nothing has happened here yet." />
      </RecordColumns>
      {dialog === "edit" && <OrganizationForm record={record} onClose={close} />}
      {dialog === "delete" && (
        <DeleteOrganization id={id} name={record.name} onClose={close} onDeleted={() => navigate("/organizations")} />
      )}
      {dialog === "contact" && <ContactForm defaultOrganizationId={id} onClose={close} />}
      {dialog === "deal" && <DealForm defaultOrganizationId={id} onClose={close} />}
    </>
  );
}
