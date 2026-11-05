import { MoneyColumn, MoneyEmpty, MoneyFigure, MonthsPanel, OwingPanel } from "../components/MoneySection";
import { price, type CentsSum } from "../lib/money";
import { plural } from "../lib/words";
import { HowLate } from "./charts/HowLate";
import { PaymentsChart } from "./charts/PaymentsChart";
import { useMoney, type Money } from "./queries";

const OVERDUE = "/invoices?status=overdue";

/** A sum from the backend's digits, to the cent, however large (V29). */
function exact(cents: CentsSum) {
  return price(BigInt(cents));
}

function Owed({ money }: { money: Money }) {
  return (
    <OwingPanel
      label="Owed to us"
      figures={
        <>
          <MoneyFigure
            label="Owed to us"
            amount={exact(money.owed.cents)}
            count={plural(money.owed.count, "invoice")}
          />
          <MoneyFigure
            label="Overdue"
            amount={exact(money.overdue.cents)}
            count={plural(money.overdue.count, "invoice")}
            to={OVERDUE}
          />
        </>
      }
      heading="How late"
    >
      {money.owed.count === 0 ? <MoneyEmpty>Nothing owed.</MoneyEmpty> : <HowLate groups={money.groups} />}
    </OwingPanel>
  );
}

function Received({ money }: { money: Money }) {
  const [previous, current] = money.payments.slice(-2);
  const anyPaid = money.payments.some((month) => BigInt(month.cents) > 0n);
  return (
    <MonthsPanel
      label="Payments received"
      title="Payments received"
      months={[
        { month: previous.month, amount: exact(previous.cents) },
        { month: current.month, amount: exact(current.cents) },
      ]}
      testId="paid"
    >
      {anyPaid ? (
        <PaymentsChart months={money.payments} />
      ) : (
        <MoneyEmpty>No payments in the last 12 months.</MoneyEmpty>
      )}
    </MonthsPanel>
  );
}

/**
 * Invoices' side of the dashboard's Money section, on the left (V29 to V31): what customers owe,
 * how much is overdue and how late, and the payments received each month. It follows today,
 * so it reads again when the day changes.
 */
export function InvoicesMoney() {
  const money = useMoney();
  return (
    <MoneyColumn loaded={money.data !== undefined} error={money.error} onRetry={() => void money.refetch()}>
      {money.data && (
        <>
          <Owed money={money.data} />
          <Received money={money.data} />
        </>
      )}
    </MoneyColumn>
  );
}
