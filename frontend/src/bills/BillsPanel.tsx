import { useState } from "react";
import { Link } from "react-router";

import { LoadFailed } from "../components/LoadFailed";
import { SidePanel } from "../components/RecordLayout";
import type { OrganizationDetail } from "../crm/queries";
import { formatDate } from "../lib/dates";
import { price } from "../lib/money";
import { useToday } from "../lib/useToday";
import { BillForm } from "./BillForm";
import { useOrganizationBills, type BillRow } from "./queries";
import { BillStatusChip, billStatus } from "./status";

/** Unpaid ones first, earliest due first, then paid ones, newest bill date first (E19). */
export function panelOrder(bills: BillRow[]): BillRow[] {
  const unpaid = bills.filter((bill) => bill.paid_on === null);
  const paid = bills.filter((bill) => bill.paid_on !== null);
  unpaid.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id);
  paid.sort((a, b) => b.bill_date.localeCompare(a.bill_date) || b.id - a.id);
  return [...unpaid, ...paid];
}

/** Such as "$4,200.00 unpaid, $1,100.00 of it overdue", or nothing when every bill is paid. */
export function unpaidLine(bills: BillRow[], today: string): string | null {
  const unpaid = bills.filter((bill) => bill.paid_on === null);
  if (unpaid.length === 0) return null;
  const total = (some: BillRow[]) => some.reduce((sum, bill) => sum + bill.total_cents, 0);
  const overdue = unpaid.filter((bill) => billStatus(bill, today) === "overdue");
  const owed = `${price(total(unpaid))} unpaid`;
  return overdue.length === 0 ? owed : `${owed}, ${price(total(overdue))} of it overdue`;
}

function BillLine({ bill, today }: { bill: BillRow; today: string }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <Link to={`/bills/${bill.id}`} className="link num min-w-0 flex-1 truncate text-[13px] font-medium">
        {bill.bill_number}
      </Link>
      <span className="num flex-none text-[12px] text-muted">{formatDate(bill.due_date)}</span>
      <span className="num w-[92px] flex-none text-right text-[13px]">{price(bill.total_cents)}</span>
      <span className="flex w-[70px] flex-none justify-end">
        <BillStatusChip status={billStatus(bill, today)} />
      </span>
    </li>
  );
}

/** An organization's bills, from the bills area's own route, on the organization's page (E19, R7). */
export function BillsPanel({ record }: { record: OrganizationDetail }) {
  const bills = useOrganizationBills(record.id);
  const today = useToday();
  const [adding, setAdding] = useState(false);
  const line = bills.data && unpaidLine(bills.data, today);

  return (
    <SidePanel
      title="Bills"
      action={
        <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
          Add bill
        </button>
      }
    >
      {line && <p className="-mt-1 mb-1 text-[13px] leading-[18px] text-muted">{line}</p>}
      <LoadFailed keeping={bills.data !== undefined} error={bills.error} onRetry={() => bills.refetch()} />
      {bills.data?.length === 0 && <p className="py-1 text-muted">No bills from this organization.</p>}
      {bills.data && bills.data.length > 0 && (
        // About 8 bills show before it scrolls.
        <ul className="-mr-2 max-h-[296px] overflow-y-auto pr-2 [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin]">
          {panelOrder(bills.data).map((bill) => (
            <BillLine key={bill.id} bill={bill} today={today} />
          ))}
        </ul>
      )}
      {adding && <BillForm defaultOrganizationId={record.id} onClose={() => setAdding(false)} />}
    </SidePanel>
  );
}
