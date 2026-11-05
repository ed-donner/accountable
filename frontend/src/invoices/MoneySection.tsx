import { format, parseISO, subMonths } from "date-fns";
import { Link } from "react-router";

import { LoadFailed } from "../components/LoadFailed";
import { price } from "../lib/money";
import { useToday } from "../lib/useToday";
import { plural } from "../lib/words";
import { HowLate } from "./charts/HowLate";
import { PaymentsChart } from "./charts/PaymentsChart";
import { useMoney, type Money } from "./queries";

const OVERDUE = "/invoices?status=overdue";

function Figure({ label, sum, to }: { label: string; sum: Money["owed"]; to?: string }) {
  const shown = (
    <>
      <span className="block text-[13px] leading-[18px] font-semibold">{label}</span>
      <span className="num block text-[24px] leading-[30px] font-medium tracking-[-0.02em]">{price(sum.cents)}</span>
      <span className="block text-[13px] leading-[18px] text-muted">{plural(sum.count, "invoice")}</span>
    </>
  );
  return to ? (
    <Link to={to} className="block rounded-control">
      {shown}
    </Link>
  ) : (
    <div>{shown}</div>
  );
}

function Owed({ money }: { money: Money }) {
  return (
    <section aria-label="Owed to us" className="panel flex min-h-0 flex-col gap-4 px-[18px] py-4">
      {money.owed.count === 0 ? (
        <>
          <h3 className="text-[16px] leading-6 font-semibold">Owed to us</h3>
          <p className="flex flex-1 items-center justify-center text-muted">Nothing owed.</p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Figure label="Owed to us" sum={money.owed} />
            <Figure label="Overdue" sum={money.overdue} to={OVERDUE} />
          </div>
          <div>
            <h3 className="mb-2 text-[13px] leading-[18px] font-semibold text-muted">How late</h3>
            <HowLate groups={money.groups} />
          </div>
        </>
      )}
    </section>
  );
}

function Received({ money, today }: { money: Money; today: string }) {
  const month = format(parseISO(today), "MMMM");
  const lastMonth = format(subMonths(parseISO(today), 1), "MMMM");
  const [previous, current] = money.payments.slice(-2);
  const anyPaid = money.payments.some((item) => item.cents > 0);
  return (
    <section aria-label="Payments received" className="panel flex min-h-0 flex-col px-[18px] py-4">
      <h3 className="text-[16px] leading-6 font-semibold">Payments received in {month}</h3>
      <div className="flex items-baseline gap-3">
        <span className="num text-[24px] leading-[30px] font-medium" data-testid="paid-this-month">
          {price(current.cents)}
        </span>
        <span className="text-[13px] whitespace-nowrap text-muted" data-testid="paid-last-month">
          {lastMonth} {price(previous.cents)}
        </span>
      </div>
      {anyPaid ? (
        <PaymentsChart months={money.payments} />
      ) : (
        <p className="flex flex-1 items-center justify-center text-muted">No payments in the last 12 months.</p>
      )}
    </section>
  );
}

/**
 * Invoices' row of the dashboard's Money section (V29 to V31): what customers owe, how much is
 * overdue and how late, and the payments received each month. App.tsx puts it in the section, above
 * bills' row. It follows today, so it reads again when the day changes.
 */
export function InvoicesMoney() {
  const money = useMoney();
  const today = useToday();
  return (
    <>
      <LoadFailed keeping={money.data !== undefined} error={money.error} onRetry={() => money.refetch()} />
      {money.data && (
        // The same columns as bills' row below and the dashboard's bottom row above.
        <div className="grid h-[320px] grid-cols-[minmax(0,0.76fr)_minmax(0,1.24fr)] gap-3">
          <Owed money={money.data} />
          <Received money={money.data} today={today} />
        </div>
      )}
    </>
  );
}
