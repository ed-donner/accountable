import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { MissingRecord } from "../../components/MissingRecord";
import { ApiError } from "../../lib/api";
import { money } from "../../lib/money";
import { ContactForm } from "../forms/ContactForm";
import { DealForm } from "../forms/DealForm";
import { DeleteContact } from "../forms/DeleteDialogs";
import { useContact } from "../queries";
import { StageChip, StatusChip } from "../StageChip";
import { Timeline } from "../Timeline";
import { Detail, LinkedList, NONE, RecordColumns, RecordHeader, SidePanel } from "../RecordLayout";

export function Contact() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const contact = useContact(id);
  const [dialog, setDialog] = useState<"edit" | "delete" | "deal" | null>(null);
  const close = () => setDialog(null);

  if (contact.error instanceof ApiError && contact.error.kind === "missing") {
    return <MissingRecord word="contact" to="/contacts" section="Contacts" />;
  }
  if (!contact.data) return null;
  const record = contact.data;

  return (
    <>
      <RecordHeader
        title={record.name}
        chips={<StatusChip status={record.status} />}
        onEdit={() => setDialog("edit")}
        onDelete={() => setDialog("delete")}
      />
      <RecordColumns
        side={
          <>
            <SidePanel title="Details">
              <dl>
                <Detail label="Organization">
                  {record.organization_id ? (
                    <Link to={`/organizations/${record.organization_id}`} className="link">
                      {record.organization_name}
                    </Link>
                  ) : (
                    NONE
                  )}
                </Detail>
                <Detail label="Job title">{record.job_title ?? NONE}</Detail>
                <Detail label="Email">
                  {record.email ? (
                    <a href={`mailto:${record.email}`} className="link">
                      {record.email}
                    </a>
                  ) : (
                    NONE
                  )}
                </Detail>
                <Detail label="Phone">{record.phone ? <span className="num text-[13px]">{record.phone}</span> : NONE}</Detail>
              </dl>
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
        <Timeline key={id} kind="contacts" id={id} logTo={{ contact_id: id }} empty="Nothing logged yet." />
      </RecordColumns>
      {dialog === "edit" && <ContactForm record={record} onClose={close} />}
      {dialog === "delete" && (
        <DeleteContact id={id} name={record.name} onClose={close} onDeleted={() => navigate("/contacts")} />
      )}
      {dialog === "deal" && (
        <DealForm
          defaultContactId={id}
          defaultOrganizationId={record.organization_id ?? undefined}
          onClose={close}
        />
      )}
    </>
  );
}
