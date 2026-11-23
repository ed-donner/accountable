import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { DeleteRecord, type Deletable } from "../shared/DeleteRecord";
import { formatDate, money, plural } from "../shared/format";
import { LateBadge } from "../shared/LateBadge";
import { LoadError, Loading } from "../shared/Loading";
import { PageHeader } from "../shared/PageHeader";
import { SidePanel } from "../shared/SidePanel";
import { ContactForm } from "../contacts/ContactForm";
import { StatusBadge } from "../contacts/StatusBadge";
import { DealForm } from "../deals/DealForm";
import { StagePill } from "../deals/StagePill";
import { OrganizationForm } from "./OrganizationForm";
import { useOrganization } from "./hooks";

type Panel = "edit" | "contact" | "deal" | null;

/** O3: details, contacts and deals, with a way to add either already linked. */
export function OrganizationPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const query = useOrganization(id);
  const [panel, setPanel] = useState<Panel>(null);
  const [deleting, setDeleting] = useState<Deletable | null>(null);
  const close = useCallback(() => setPanel(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadError error={query.error} what="organization" />;
  const org = query.data;
  const openDeals = org.deals.filter((d) => d.stage !== "won" && d.stage !== "lost");

  return (
    <>
      <PageHeader
        title={org.name}
        summary={`${org.industry ?? "Organization"} · ${plural(org.contacts.length, "contact")} · ${plural(openDeals.length, "open deal")}`}
        action={
          <button
            type="button"
            className="btn ghost"
            onClick={() => setDeleting({ kind: "organization", id: org.id, name: org.name })}
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete organization
          </button>
        }
      />
      <div className="record">
        <section className="panel" aria-label="Details">
          <div className="panel-head">
            <h2>Details</h2>
            <button type="button" className="mini" onClick={() => setPanel("edit")}>
              <Pencil size={13} aria-hidden="true" />
              Edit
            </button>
          </div>
          <dl className="details">
            <dt>Website</dt>
            <dd>
              {org.website ? (
                <a href={org.website} target="_blank" rel="noreferrer">
                  {org.website.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                <span className="muted">None</span>
              )}
            </dd>
            <dt>Industry</dt>
            <dd>{org.industry ?? <span className="muted">None</span>}</dd>
            <dt>Open pipeline</dt>
            <dd className="mono">{money(openDeals.reduce((sum, d) => sum + d.value, 0))}</dd>
            <dt>Notes</dt>
            <dd>{org.notes ?? <span className="muted">None</span>}</dd>
          </dl>
        </section>

        <div className="record-side">
          <section className="panel" aria-label="Contacts">
            <div className="panel-head">
              <h2>Contacts</h2>
              <button type="button" className="mini" onClick={() => setPanel("contact")}>
                <Plus size={13} aria-hidden="true" />
                Add contact
              </button>
            </div>
            {org.contacts.length === 0 ? (
              <p className="muted">No contacts at {org.name} yet.</p>
            ) : (
              <ul className="linked">
                {org.contacts.map((c) => (
                  <li key={c.id}>
                    <div>
                      <Link to={`/contacts/${c.id}`}>{c.name}</Link>
                      <div className="meta">
                        {[c.job_title, c.email].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel" aria-label="Deals">
            <div className="panel-head">
              <h2>Deals</h2>
              <button type="button" className="mini" onClick={() => setPanel("deal")}>
                <Plus size={13} aria-hidden="true" />
                Add deal
              </button>
            </div>
            {org.deals.length === 0 ? (
              <p className="muted">No deals with {org.name} yet.</p>
            ) : (
              <ul className="linked">
                {org.deals.map((d) => (
                  <li key={d.id}>
                    <div>
                      <Link to={`/deals/${d.id}`}>{d.name}</Link> <LateBadge late={d.is_late} />
                      <div className="meta">
                        <StagePill stage={d.stage} /> ·{" "}
                        {d.close_date ? formatDate(d.close_date) : "No close date"}
                      </div>
                    </div>
                    <span className="mono">{money(d.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <SidePanel
        title={
          panel === "edit" ? "Edit organization" : panel === "contact" ? "Add contact" : "Add deal"
        }
        open={panel !== null}
        onClose={close}
      >
        {panel === "edit" && (
          <OrganizationForm organization={org} onSaved={close} onCancel={close} />
        )}
        {panel === "contact" && (
          <ContactForm organizationId={org.id} onSaved={close} onCancel={close} />
        )}
        {panel === "deal" && (
          <DealForm preset={{ organizationId: org.id }} onSaved={close} onCancel={close} />
        )}
      </SidePanel>
      {deleting && (
        <DeleteRecord
          record={deleting}
          onClose={closeDelete}
          onDeleted={() => navigate("/organizations")}
        />
      )}
    </>
  );
}
