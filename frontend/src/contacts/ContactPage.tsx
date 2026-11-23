import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Timeline } from "../activities/Timeline";
import { DeleteRecord, type Deletable } from "../shared/DeleteRecord";
import { formatDate, money } from "../shared/format";
import { LateBadge } from "../shared/LateBadge";
import { LoadError, Loading } from "../shared/Loading";
import { PageHeader } from "../shared/PageHeader";
import { RecordLink } from "../shared/RecordLink";
import { SidePanel } from "../shared/SidePanel";
import { DealForm } from "../deals/DealForm";
import { StagePill } from "../deals/StagePill";
import { ContactForm } from "./ContactForm";
import { StatusBadge } from "./StatusBadge";
import { useContact } from "./hooks";

/** C4: details, organization, their deals and their timeline. */
export function ContactPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const query = useContact(id);
  const [panel, setPanel] = useState<"edit" | "deal" | null>(null);
  const [deleting, setDeleting] = useState<Deletable | null>(null);
  const close = useCallback(() => setPanel(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadError error={query.error} what="contact" />;
  const contact = query.data;

  return (
    <>
      <PageHeader
        title={contact.name}
        summary={
          [contact.job_title, contact.organization?.name].filter(Boolean).join(" at ") || "Contact"
        }
        action={
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              setDeleting({
                kind: "contact",
                id: contact.id,
                name: contact.name,
              })
            }
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete contact
          </button>
        }
      />
      <div className="record">
        <div className="record-side">
          <section className="panel" aria-label="Details">
            <div className="panel-head">
              <h2>Details</h2>
              <button type="button" className="mini" onClick={() => setPanel("edit")}>
                <Pencil size={13} aria-hidden="true" />
                Edit
              </button>
            </div>
            <dl className="details">
              <dt>Status</dt>
              <dd>
                <StatusBadge status={contact.status} />
              </dd>
              <dt>Organization</dt>
              <dd>
                <RecordLink
                  to={`/organizations/${contact.organization?.id}`}
                  name={contact.organization?.name}
                  none="No organization"
                />
              </dd>
              <dt>Job title</dt>
              <dd>{contact.job_title ?? <span className="muted">None</span>}</dd>
              <dt>Email</dt>
              <dd>
                {contact.email ? (
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                ) : (
                  <span className="muted">None</span>
                )}
              </dd>
              <dt>Phone</dt>
              <dd className="mono">{contact.phone ?? <span className="muted">None</span>}</dd>
            </dl>
          </section>
          <section className="panel" aria-label="Deals">
            <div className="panel-head">
              <h2>Deals</h2>
              <button type="button" className="mini" onClick={() => setPanel("deal")}>
                <Plus size={13} aria-hidden="true" />
                Add deal
              </button>
            </div>
            {contact.deals.length === 0 ? (
              <p className="muted">{contact.name} isn't the main contact on any deals yet.</p>
            ) : (
              <ul className="linked">
                {contact.deals.map((d) => (
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
        <Timeline kind="contact" id={contact.id} />
      </div>

      <SidePanel
        title={panel === "edit" ? "Edit contact" : "Add deal"}
        open={panel !== null}
        onClose={close}
      >
        {panel === "edit" && <ContactForm contact={contact} onSaved={close} onCancel={close} />}
        {panel === "deal" && (
          <DealForm
            preset={{
              organizationId: contact.organization_id,
              contactId: contact.id,
            }}
            onSaved={close}
            onCancel={close}
          />
        )}
      </SidePanel>
      {deleting && (
        <DeleteRecord
          record={deleting}
          onClose={closeDelete}
          onDeleted={() => navigate("/contacts")}
        />
      )}
    </>
  );
}
