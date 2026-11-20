import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { isNotFound } from "@/api/client";
import { useDeal, useDealTimeline } from "@/api/deals";
import { LateBadge, StageBadge } from "@/components/Badges";
import { DeleteDialog, type DeleteTarget } from "@/components/DeleteDialog";
import { DealForm } from "@/components/forms/DealForm";
import { RecordBand } from "@/components/layout/RecordBand";
import { Band } from "@/components/layout/Band";
import { PageBody } from "@/components/layout/PageBody";
import { RecordLink } from "@/components/links";
import { StageBar } from "@/components/StageBar";
import { BandPlaceholder, Gone, LoadFailed, Panel, PanelTitle, Placeholder } from "@/components/states";
import { Timeline } from "@/components/timeline/Timeline";
import { formatDate, money, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function DealPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const deal = useDeal(id);
  const timeline = useDealTimeline(id, deal.isSuccess);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  if (isNotFound(deal.error) || !Number.isFinite(id)) return <Gone kind="deal" to="/deals" section="deals" />;
  if (deal.error) return <LoadFailed message={deal.error.message} />;
  if (!deal.data) {
    return (
      <>
        <title>Deal · Accountable</title>
        <Band title={<BandPlaceholder className="h-9 w-72" />}>
          <BandPlaceholder className="mt-6 h-10 w-full" />
        </Band>
        <PageBody>
          <Placeholder className="h-64 w-full" />
        </PageBody>
      </>
    );
  }

  const data = deal.data;
  return (
    <>
      <title>{`${data.name} · Accountable`}</title>
      <RecordBand
        back={{ to: "/deals", label: "Deals" }}
        title={data.name}
        badges={
          <>
            <StageBadge stage={data.stage} />
            {data.is_late && <LateBadge />}
          </>
        }
        links={
          <span className="flex items-center gap-2">
            <RecordLink to={`/organizations/${data.organization.id}`} className="text-band-ink-soft">
              {data.organization.name}
            </RecordLink>
            {data.main_contact && (
              <>
                <span aria-hidden>·</span>
                <RecordLink to={`/contacts/${data.main_contact.id}`} className="text-band-ink-soft">
                  {data.main_contact.name}
                </RecordLink>
              </>
            )}
          </span>
        }
        kind="deal"
        onEdit={() => setEditing(true)}
        onDelete={() => setDeleting({ kind: "deal", id: data.id, name: data.name })}
      >
        <StageBar deal={data} />
      </RecordBand>
      <PageBody>
        <div className="grid grid-cols-3 gap-6">
          <Panel className="self-start">
            <PanelTitle>Details</PanelTitle>
            <dl className="grid gap-3 text-[14px]">
              <Figure label="Value" value={money(data.value)} />
              <Figure label="Probability" value={percent(data.probability)} />
              <Figure label="Expected revenue" value={money(data.expected_value)} />
              <Figure
                label="Close date"
                value={
                  <span className="inline-flex items-center gap-2">
                    {data.is_late && <LateBadge />}
                    <span className={cn(data.is_late && "text-raspberry-text")}>{formatDate(data.close_date)}</span>
                  </span>
                }
              />
            </dl>
          </Panel>
          <div className="col-span-2">
            <Timeline target={{ deal_id: data.id }} entries={timeline.data} showDeals={false} />
          </div>
        </div>
      </PageBody>
      <DealForm open={editing} onOpenChange={setEditing} deal={data} />
      <DeleteDialog
        target={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={() => navigate("/deals")}
      />
    </>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-b-0 last:pb-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-mono text-[15px] text-ink tabular">{value}</dd>
    </div>
  );
}
