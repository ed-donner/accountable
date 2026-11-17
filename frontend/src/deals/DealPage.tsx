import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import { Timeline } from "../activities/Timeline";
import { DeleteRecord, type Deletable } from "../shared/DeleteRecord";
import { formatDate, money } from "../shared/format";
import { LateBadge } from "../shared/LateBadge";
import { LoadError, Loading } from "../shared/Loading";
import { PageHeader } from "../shared/PageHeader";
import { RecordLink } from "../shared/RecordLink";
import { SidePanel } from "../shared/SidePanel";
import { stageInfo } from "../shared/stages";
import { DealForm } from "./DealForm";
import { StagePill } from "./StagePill";
import { useDeal } from "./hooks";

/** D9: details, organization and main contact, and the timeline. */
export function DealPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const query = useDeal(id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<Deletable | null>(null);
  const close = useCallback(() => setEditing(false), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadError error={query.error} what="deal" />;
  const deal = query.data;
  const closed = !stageInfo(deal.stage).open;

  return (
    <>
      <PageHeader
        title={deal.name}
        summary={
          <span className="name-cell">
            <StagePill stage={deal.stage} /> · <span className="mono">{money(deal.value)}</span>
            <LateBadge late={deal.is_late} />
          </span>
        }
        action={
          <button type="button" className="btn ghost" onClick={() => setDeleting({ kind: "deal", id: deal.id, name: deal.name })}>
            <Trash2 size={16} aria-hidden="true" />
            Delete deal
          </button>
        }
      />
      <div className="record">
        <section className="panel" aria-label="Details">
          <div className="panel-head">
            <h2>Details</h2>
            <button type="button" className="mini" onClick={() => setEditing(true)}>
              <Pencil size={13} aria-hidden="true" />
              Edit
            </button>
          </div>
          <dl className="details">
            <dt>Organization</dt>
            <dd>
              <RecordLink to={`/organizations/${deal.organization_id}`} name={deal.organization_name} none="No organization" />
            </dd>
            <dt>Main contact</dt>
            <dd>
              <RecordLink to={`/contacts/${deal.contact_id}`} name={deal.contact_name} none="No main contact" />
            </dd>
            <dt>Stage</dt>
            <dd>
              <StagePill stage={deal.stage} />
            </dd>
            <dt>Value</dt>
            <dd className="mono">{money(deal.value)}</dd>
            <dt>Probability</dt>
            <dd className="mono">{deal.probability}%</dd>
            <dt>Expected</dt>
            <dd className="mono">{money(deal.expected_revenue)}</dd>
            <dt>{closed ? "Closed" : "Close date"}</dt>
            <dd>
              <span className="name-cell">
                {deal.close_date ? <span className="mono">{formatDate(deal.close_date)}</span> : <span className="muted">Not set</span>}
                <LateBadge late={deal.is_late} />
              </span>
            </dd>
          </dl>
          {deal.organization_id === null && (
            <p className="prompt">This deal has no organization. Edit it to choose one.</p>
          )}
        </section>
        <Timeline kind="deal" id={deal.id} />
      </div>

      <SidePanel title="Edit deal" open={editing} onClose={close}>
        {editing && <DealForm deal={deal} onSaved={close} onCancel={close} />}
      </SidePanel>
      {deleting && <DeleteRecord record={deleting} onClose={closeDelete} onDeleted={() => navigate("/deals")} />}
    </>
  );
}
