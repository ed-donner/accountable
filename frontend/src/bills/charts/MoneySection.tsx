import type { ReactNode } from "react";
import { Link } from "react-router";

import { LoadFailed } from "../../components/LoadFailed";
import { price } from "../../lib/money";
import { plural } from "../../lib/words";
import { useMoney, type CentsSum, type MoneyFigures } from "../queries";
import { DueTimeline } from "./DueTimeline";
import { SpendingChart } from "./SpendingChart";

function Empty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-muted">{children}</div>;
}

/** A headline figure that opens Bills under its filter (E21). In ink, Overdue included: its label says what it is. */
function Figure({ to, label, value, count }: { to: string; label: string; value: CentsSum; count: string }) {
  return (
    <Link to={to} className="block rounded-control px-1.5">
      <span className="block text-[13px] leading-[18px] font-semibold">{label}</span>
      <span className="num block text-[24px] leading-[30px] font-medium tracking-[-0.02em]">
        {price(BigInt(value))}
      </span>
      <span className="block text-[13px] leading-[18px] text-muted">{count}</span>
    </Link>
  );
}

function BillsToPay({ data }: { data: MoneyFigures }) {
  const { owed, overdue, due } = data;
  return (
    <section aria-label="Bills to pay" className="panel flex min-h-0 flex-col px-[18px] py-4">
      <h3 className="text-[16px] leading-6 font-semibold">Bills to pay</h3>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Figure to="/bills" label="What we owe" value={owed.total_cents} count={plural(owed.count, "unpaid bill")} />
        <Figure
          to="/bills?status=overdue"
          label="Overdue"
          value={overdue.total_cents}
          count={plural(overdue.count, "bill")}
        />
      </div>
      <div className="mt-5 flex items-start justify-between gap-3 px-1.5">
        <h4 className="text-[13px] leading-[18px] font-semibold">Due in the next 30 days</h4>
        <div className="text-right">
          <span className="num block text-[16px] leading-6 font-medium" data-testid="due-total">
            {price(BigInt(due.total_cents))}
          </span>
          <span className="block text-[13px] leading-[18px] text-muted">{plural(due.count, "bill")}</span>
        </div>
      </div>
      {due.bills.length > 0 ? (
        <DueTimeline bills={due.bills} today={data.today} />
      ) : (
        <Empty>No bills due in the next 30 days.</Empty>
      )}
    </section>
  );
}

function Spending({ data }: { data: MoneyFigures }) {
  const anySpending = data.months.some((month) => BigInt(month.total_cents) > 0n);
  return (
    <section aria-label="Spending by category" className="panel flex min-h-0 flex-col gap-2 px-[18px] py-4">
      <h3 className="text-[16px] leading-6 font-semibold">Spending by category</h3>
      {anySpending ? (
        <SpendingChart months={data.months} />
      ) : (
        <Empty>Spending will show here once you've added bills.</Empty>
      )}
    </section>
  );
}

/**
 * Bills' row of the dashboard's Money section (H10): what we owe, what's overdue, what's due in
 * the next 30 days, and spending by category, from the bills area's own route (E20). App.tsx puts
 * it in the section, below invoices' row.
 */
export function BillsMoney() {
  const money = useMoney();
  const data = money.data;
  return (
    <>
      <LoadFailed keeping={data !== undefined} error={money.error} onRetry={() => money.refetch()} />
      {data && (
        <div className="grid h-[380px] grid-cols-[minmax(0,0.76fr)_minmax(0,1.24fr)] gap-3">
          <BillsToPay data={data} />
          <Spending data={data} />
        </div>
      )}
    </>
  );
}
