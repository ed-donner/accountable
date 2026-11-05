import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { Chip } from "../../components/Chip";
import { LoadFailed } from "../../components/LoadFailed";
import { MissingRecord } from "../../components/MissingRecord";
import { AddedAndChanged, Detail, NONE, RecordColumns, RecordHeader, SidePanel } from "../../components/RecordLayout";
import { ApiError } from "../../lib/api";
import { formatDate } from "../../lib/dates";
import { money } from "../../lib/money";
import { useToday } from "../../lib/useToday";
import { recordId } from "../../lib/validate";
import { isLate, isOpen } from "../deals";
import { DealForm } from "../forms/DealForm";
import { DeleteDeal } from "../forms/DeleteDialogs";
import { useDeal } from "../queries";
import { StageChip } from "../StageChip";
import { Timeline } from "../Timeline";

export function Deal() {
  const id = recordId(useParams().id);
  if (id === null) return <MissingRecord word="deal" to="/deals" section="Deals" />;
  return <DealRecord id={id} />;
}

function DealRecord({ id }: { id: number }) {
  const navigate = useNavigate();
  const deal = useDeal(id);
  const today = useToday();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const close = () => setDialog(null);

  if (deal.error instanceof ApiError && deal.error.kind === "missing") {
    return <MissingRecord word="deal" to="/deals" section="Deals" />;
  }
  if (!deal.data) return <LoadFailed onPage error={deal.error} onRetry={() => deal.refetch()} />;
  const record = deal.data;
  const late = isLate(record, today);

  return (
    <>
      <RecordHeader
        title={record.name}
        chips={
          <>
            <StageChip stage={record.stage} />
            {late && <Chip tone="alert">Late</Chip>}
          </>
        }
        onEdit={() => setDialog("edit")}
        onDelete={() => setDialog("delete")}
      />
      <LoadFailed onPage keeping error={deal.error} onRetry={() => deal.refetch()} />
      <RecordColumns
        side={
          <SidePanel title="Details">
            <dl>
              <Detail label="Value">
                <span className="num text-[13px]">{money(record.value)}</span>
              </Detail>
              <Detail label="Probability">
                <span className="num text-[13px]">{record.probability}%</span>
              </Detail>
              {isOpen(record.stage) && (
                <Detail label="Expected revenue">
                  <span className="num text-[13px]">{money(record.expected_revenue)}</span>
                </Detail>
              )}
              <Detail label="Close date">
                <span className="num text-[13px]">{formatDate(record.close_date)}</span>
              </Detail>
              <Detail label="Organization">
                {record.organization_id ? (
                  <Link to={`/organizations/${record.organization_id}`} className="link">
                    {record.organization_name}
                  </Link>
                ) : (
                  NONE
                )}
              </Detail>
              <Detail label="Main contact">
                {record.main_contact_id ? (
                  <Link to={`/contacts/${record.main_contact_id}`} className="link">
                    {record.main_contact_name}
                  </Link>
                ) : (
                  NONE
                )}
              </Detail>
            </dl>
            <AddedAndChanged record={record} />
          </SidePanel>
        }
      >
        <Timeline key={id} kind="deals" id={id} logTo={{ deal_id: id }} empty="Nothing logged yet." />
      </RecordColumns>
      {dialog === "edit" && <DealForm record={record} onClose={close} />}
      {dialog === "delete" && (
        <DeleteDeal id={id} name={record.name} onClose={close} onDeleted={() => navigate("/deals")} />
      )}
    </>
  );
}
