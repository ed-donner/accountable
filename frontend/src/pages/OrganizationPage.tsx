import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Plus } from "lucide-react";
import { isNotFound } from "@/api/client";
import { useOrganization } from "@/api/organizations";
import { LateBadge, StageBadge, StatusBadge } from "@/components/Badges";
import { DeleteDialog, type DeleteTarget } from "@/components/DeleteDialog";
import { ContactForm } from "@/components/forms/ContactForm";
import { DealForm } from "@/components/forms/DealForm";
import { OrganizationForm } from "@/components/forms/OrganizationForm";
import { Band } from "@/components/layout/Band";
import { PageBody } from "@/components/layout/PageBody";
import { RecordBand, RecordFigure } from "@/components/layout/RecordBand";
import { WebsiteLink } from "@/components/links";
import { BandPlaceholder, Gone, LoadFailed, Panel, PanelTitle, Placeholder } from "@/components/states";
import { Button } from "@/components/ui/button";
import { formatDate, money, plural } from "@/lib/format";

export default function OrganizationPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const organization = useOrganization(id);
  const [editing, setEditing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [addingDeal, setAddingDeal] = useState(false);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  if (isNotFound(organization.error) || !Number.isFinite(id)) {
    return <Gone kind="organization" to="/organizations" section="organizations" />;
  }
  if (organization.error) return <LoadFailed message={organization.error.message} />;
  if (!organization.data) {
    return (
      <>
        <title>Organization · Accountable</title>
        <Band title={<BandPlaceholder className="h-9 w-72" />} />
        <PageBody>
          <Placeholder className="h-64 w-full" />
        </PageBody>
      </>
    );
  }

  const data = organization.data;
  return (
    <>
      <title>{`${data.name} · Accountable`}</title>
      <RecordBand
        back={{ to: "/organizations", label: "Organizations" }}
        title={data.name}
        links={
          <span className="flex items-center gap-2">
            {data.industry && <span>{data.industry}</span>}
            {data.industry && data.website && <span aria-hidden>·</span>}
            <WebsiteLink website={data.website} className="text-band-ink-soft" />
          </span>
        }
        figures={
          <>
            <RecordFigure label="Open pipeline" value={money(data.open_pipeline)} />
            <RecordFigure label="Revenue won to date" value={money(data.revenue_won)} tone="sea" />
          </>
        }
        kind="organization"
        onEdit={() => setEditing(true)}
        onDelete={() => setDeleting({ kind: "organization", id: data.id, name: data.name })}
      />
      <PageBody>
        <div className="grid grid-cols-3 gap-6">
          <Panel className="self-start">
            <PanelTitle>Details</PanelTitle>
            <dl className="grid gap-3 text-[14px]">
              <div className="grid gap-0.5">
                <dt className="text-[12px] font-medium text-ink-muted">Industry</dt>
                <dd className="text-ink">{data.industry || <span className="text-ink-subtle">Not given</span>}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-[12px] font-medium text-ink-muted">Website</dt>
                <dd>
                  {data.website ? (
                    <WebsiteLink website={data.website} />
                  ) : (
                    <span className="text-ink-subtle">Not given</span>
                  )}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-[12px] font-medium text-ink-muted">Notes</dt>
                <dd className="break-words whitespace-pre-wrap text-ink">
                  {data.notes || <span className="text-ink-subtle">No notes</span>}
                </dd>
              </div>
            </dl>
          </Panel>

          <div className="col-span-2 grid content-start gap-6">
            <Panel>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[16px] leading-6 font-semibold">
                  Contacts{" "}
                  <span className="font-mono text-[13px] font-normal text-ink-subtle">{data.contacts.length}</span>
                </h2>
                <Button variant="second" size="sm" onClick={() => setAddingContact(true)}>
                  <Plus /> Add contact
                </Button>
              </div>
              {data.contacts.length === 0 ? (
                <p className="text-[14px] text-ink-muted">No contacts yet.</p>
              ) : (
                <ul aria-label="Contacts" className="divide-y divide-line">
                  {data.contacts.map((contact) => (
                    <li key={contact.id}>
                      <Link
                        to={`/contacts/${contact.id}`}
                        className="flex items-center gap-3 px-2 py-2.5 hover:bg-[#F5F8F9]"
                      >
                        <span className="font-medium text-ink">{contact.name}</span>
                        <StatusBadge status={contact.status} />
                        <span className="ml-auto text-[13px] text-ink-muted">{contact.job_title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[16px] leading-6 font-semibold">
                  Deals <span className="font-mono text-[13px] font-normal text-ink-subtle">{data.deals.length}</span>
                </h2>
                <Button variant="second" size="sm" onClick={() => setAddingDeal(true)}>
                  <Plus /> Add deal
                </Button>
              </div>
              {data.deals.length === 0 ? (
                <p className="text-[14px] text-ink-muted">No deals yet.</p>
              ) : (
                <ul aria-label="Deals" className="divide-y divide-line">
                  {data.deals.map((deal) => (
                    <li key={deal.id}>
                      <Link to={`/deals/${deal.id}`} className="flex items-center gap-3 px-2 py-2.5 hover:bg-[#F5F8F9]">
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{deal.name}</span>
                        <StageBadge stage={deal.stage} />
                        <span className="w-24 text-right font-mono text-[13px] text-ink tabular">
                          {money(deal.value)}
                        </span>
                        <span className="flex w-40 items-center justify-end gap-2 font-mono text-[13px] text-ink-muted tabular">
                          {deal.is_late && <LateBadge />}
                          {formatDate(deal.close_date)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <p className="sr-only">
              {plural(data.contacts.length, "contact")} and {plural(data.deals.length, "deal")}
            </p>
          </div>
        </div>
      </PageBody>
      <OrganizationForm open={editing} onOpenChange={setEditing} organization={data} />
      <ContactForm open={addingContact} onOpenChange={setAddingContact} defaultOrganizationId={data.id} />
      <DealForm open={addingDeal} onOpenChange={setAddingDeal} defaultOrganizationId={data.id} />
      <DeleteDialog
        target={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={() => navigate("/organizations")}
      />
    </>
  );
}
