import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isNotFound } from "@/api/client";
import { useContact, useContactTimeline } from "@/api/contacts";
import { StageBadge, StatusBadge } from "@/components/Badges";
import { DeleteDialog, type DeleteTarget } from "@/components/DeleteDialog";
import { ContactForm } from "@/components/forms/ContactForm";
import { Band } from "@/components/layout/Band";
import { PageBody } from "@/components/layout/PageBody";
import { RecordBand } from "@/components/layout/RecordBand";
import { EmailLink, PhoneLink, RecordLink } from "@/components/links";
import { BandPlaceholder, Gone, LoadFailed, Panel, PanelTitle, Placeholder } from "@/components/states";
import { Timeline } from "@/components/timeline/Timeline";
import { money } from "@/lib/format";

export default function ContactPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const contact = useContact(id);
  const timeline = useContactTimeline(id, contact.isSuccess);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  if (isNotFound(contact.error) || !Number.isFinite(id))
    return <Gone kind="contact" to="/contacts" section="contacts" />;
  if (contact.error) return <LoadFailed message={contact.error.message} />;
  if (!contact.data) {
    return (
      <>
        <title>Contact · Accountable</title>
        <Band title={<BandPlaceholder className="h-9 w-64" />} />
        <PageBody>
          <Placeholder className="h-64 w-full" />
        </PageBody>
      </>
    );
  }

  const data = contact.data;
  return (
    <>
      <title>{`${data.name} · Accountable`}</title>
      <RecordBand
        back={{ to: "/contacts", label: "Contacts" }}
        title={data.name}
        badges={<StatusBadge status={data.status} />}
        links={
          <span className="flex items-center gap-2">
            {data.job_title && <span>{data.job_title}</span>}
            {data.job_title && data.organization && <span aria-hidden>·</span>}
            {data.organization && (
              <RecordLink to={`/organizations/${data.organization.id}`} className="text-band-ink-soft">
                {data.organization.name}
              </RecordLink>
            )}
          </span>
        }
        kind="contact"
        onEdit={() => setEditing(true)}
        onDelete={() => setDeleting({ kind: "contact", id: data.id, name: data.name })}
      />
      <PageBody>
        <div className="grid grid-cols-3 gap-6">
          <div className="grid content-start gap-6">
            <Panel>
              <PanelTitle>Details</PanelTitle>
              <dl className="grid gap-3 text-[14px]">
                <Detail label="Email" value={<EmailLink email={data.email} />} />
                <Detail label="Phone" value={<PhoneLink phone={data.phone} />} />
                <Detail label="Job title" value={data.job_title} />
                <Detail
                  label="Organization"
                  value={
                    data.organization && (
                      <RecordLink to={`/organizations/${data.organization.id}`}>{data.organization.name}</RecordLink>
                    )
                  }
                />
              </dl>
            </Panel>
            <Panel>
              <PanelTitle>Deals as main contact</PanelTitle>
              {data.deals.length === 0 ? (
                <p className="text-[14px] text-ink-muted">Not the main contact on any deals.</p>
              ) : (
                <ul className="grid gap-1">
                  {data.deals.map((deal) => (
                    <li key={deal.id}>
                      <Link
                        to={`/deals/${deal.id}`}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[#F5F8F9]"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{deal.name}</span>
                        <StageBadge stage={deal.stage} />
                        <span className="font-mono text-[13px] text-ink tabular">{money(deal.value)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <div className="col-span-2">
            <Timeline target={{ contact_id: data.id }} entries={timeline.data} showDeals />
          </div>
        </div>
      </PageBody>
      <ContactForm open={editing} onOpenChange={setEditing} contact={data} />
      <DeleteDialog
        target={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={() => navigate("/contacts")}
      />
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[12px] font-medium text-ink-muted">{label}</dt>
      <dd className="text-ink">{value || <span className="text-ink-subtle">Not given</span>}</dd>
    </div>
  );
}
