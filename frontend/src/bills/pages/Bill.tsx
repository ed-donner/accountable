import { CircleCheck, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { LoadFailed } from "../../components/LoadFailed";
import { MissingRecord } from "../../components/MissingRecord";
import {
  AddedAndChanged,
  Detail,
  RecordColumns,
  RecordHeader,
  SidePanel,
  type HeaderAction,
} from "../../components/RecordLayout";
import { AccountingPanel } from "../../books/AccountingPanel";
import { ApiError } from "../../lib/api";
import { formatDate } from "../../lib/dates";
import { price } from "../../lib/money";
import { useToday } from "../../lib/useToday";
import { recordId } from "../../lib/validate";
import { BillForm } from "../BillForm";
import { CategoryLabel } from "../categories";
import { DeleteBill } from "../DeleteBill";
import { MarkPaidDialog } from "../MarkPaidDialog";
import { useBill, usePaid, type BillDetail } from "../queries";
import { BillStatusChip, billStatus } from "../status";

/** A bill's page (E18). There's no timeline, because nothing is logged against a bill. */
export function Bill() {
  const id = recordId(useParams().id);
  if (id === null) return <MissingRecord word="bill" to="/bills" section="Bills" />;
  return <BillRecord id={id} />;
}

function inMono(text: string) {
  return <span className="num text-[13px]">{text}</span>;
}

/** Mark paid or Mark unpaid, which stay on the page (E9, E10). */
function usePaidAction(record: BillDetail, onMarkPaid: () => void): HeaderAction {
  const { markUnpaid, pending } = usePaid();
  const paidOn = record.paid_on;
  if (paidOn === null) {
    return { label: "Mark paid", icon: <CircleCheck size={15} aria-hidden="true" />, onClick: onMarkPaid };
  }
  return {
    label: "Mark unpaid",
    icon: <Undo2 size={15} aria-hidden="true" />,
    onClick: () => void markUnpaid(record.id, paidOn),
    pending,
  };
}

function BillRecord({ id }: { id: number }) {
  const navigate = useNavigate();
  const bill = useBill(id);
  const [dialog, setDialog] = useState<"edit" | "pay" | "delete" | null>(null);
  const close = () => setDialog(null);

  if (bill.error instanceof ApiError && bill.error.kind === "missing") {
    return <MissingRecord word="bill" to="/bills" section="Bills" />;
  }
  if (!bill.data) return <LoadFailed onPage error={bill.error} onRetry={() => bill.refetch()} />;
  const record = bill.data;

  return (
    <>
      <BillHeader record={record} onDialog={setDialog} />
      <LoadFailed onPage keeping error={bill.error} onRetry={() => bill.refetch()} />
      <RecordColumns side={<BillDetails record={record} />}>
        <SidePanel title="Notes">
          {record.notes ? (
            <p className="whitespace-pre-wrap">{record.notes}</p>
          ) : (
            <p className="text-muted">No notes.</p>
          )}
        </SidePanel>
        <AccountingPanel kind="bill" id={record.id} />
      </RecordColumns>
      {dialog === "edit" && <BillForm record={record} onClose={close} />}
      {dialog === "pay" && <MarkPaidDialog bill={record} onClose={close} />}
      {dialog === "delete" && <DeleteBill bill={record} onClose={close} onDeleted={() => navigate("/bills")} />}
    </>
  );
}

type HeaderProps = { record: BillDetail; onDialog: (dialog: "edit" | "pay" | "delete") => void };

function BillHeader({ record, onDialog }: HeaderProps) {
  const today = useToday();
  const action = usePaidAction(record, () => onDialog("pay"));
  return (
    <>
      <RecordHeader
        title={`Bill ${record.bill_number}`}
        chips={<BillStatusChip status={billStatus(record, today)} />}
        onEdit={() => onDialog("edit")}
        action={action}
        onDelete={() => onDialog("delete")}
      />
      <p className="-mt-1.5 truncate px-6 pb-2.5">
        From{" "}
        <Link to={`/organizations/${record.organization.id}`} className="link font-medium">
          {record.organization.name}
        </Link>
      </p>
    </>
  );
}

function BillDetails({ record }: { record: BillDetail }) {
  return (
    <SidePanel title="Details">
      <p className="num text-[24px] leading-[30px] font-medium tracking-[-0.02em]">{price(record.total_cents)}</p>
      <dl className="mt-1">
        <Detail label="Amount before tax">{inMono(price(record.amount_cents))}</Detail>
        <Detail label="Tax">{inMono(price(record.tax_cents))}</Detail>
        <Detail label="Category">
          <CategoryLabel category={record.category} />
        </Detail>
        <Detail label="Bill date">{inMono(formatDate(record.bill_date))}</Detail>
        <Detail label="Due date">{inMono(formatDate(record.due_date))}</Detail>
        <Detail label="Paid on">
          {record.paid_on ? inMono(formatDate(record.paid_on)) : <span className="text-muted">Not paid yet</span>}
        </Detail>
      </dl>
      <AddedAndChanged record={record} />
    </SidePanel>
  );
}
