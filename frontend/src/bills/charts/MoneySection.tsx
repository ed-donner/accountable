import { MoneyColumn, MoneyEmpty, MoneyFigure, MonthsPanel, OwingPanel } from "../../components/MoneySection";
import { price } from "../../lib/money";
import { plural } from "../../lib/words";
import { useMoney, type MoneyFigures } from "../queries";
import { DueTimeline } from "./DueTimeline";
import { Legend, SpendingChart } from "./SpendingChart";

/** A sum from the backend's digits, to the cent, however large (E20). */
function exact(cents: string) {
  return price(BigInt(cents));
}

function WhatWeOwe({ data }: { data: MoneyFigures }) {
  const { owed, overdue, due } = data;
  return (
    <OwingPanel
      label="What we owe"
      figures={
        <>
          <MoneyFigure
            label="What we owe"
            amount={exact(owed.total_cents)}
            count={plural(owed.count, "unpaid bill")}
            to="/bills"
          />
          <MoneyFigure
            label="Overdue"
            amount={exact(overdue.total_cents)}
            count={plural(overdue.count, "bill")}
            to="/bills?status=overdue"
          />
        </>
      }
      heading="Due in the next 30 days"
      beside={
        <span className="text-[13px] leading-[18px] whitespace-nowrap">
          <span className="num font-medium" data-testid="due-total">
            {exact(due.total_cents)}
          </span>
          <span className="ml-2 text-muted">{plural(due.count, "bill")}</span>
        </span>
      }
    >
      {due.bills.length > 0 ? (
        <DueTimeline bills={due.bills} today={data.today} />
      ) : (
        <MoneyEmpty>No bills due in the next 30 days.</MoneyEmpty>
      )}
    </OwingPanel>
  );
}

function Spending({ data }: { data: MoneyFigures }) {
  const [previous, current] = data.months.slice(-2);
  const anySpending = data.months.some((month) => BigInt(month.total_cents) > 0n);
  return (
    <MonthsPanel
      label="Spending by category"
      title="Spending"
      months={[
        { month: previous.month, amount: exact(previous.total_cents) },
        { month: current.month, amount: exact(current.total_cents) },
      ]}
      testId="spent"
      beside={anySpending && <Legend />}
    >
      {anySpending ? (
        <SpendingChart months={data.months} />
      ) : (
        <MoneyEmpty>Spending will show here once you've added bills.</MoneyEmpty>
      )}
    </MonthsPanel>
  );
}

/**
 * Bills' side of the dashboard's Money section, on the right (E20 to E23): what we owe, what's
 * overdue, what's due in the next 30 days, and spending by category, from the bills area's own
 * route.
 */
export function BillsMoney() {
  const money = useMoney();
  const data = money.data;
  return (
    <MoneyColumn loaded={data !== undefined} error={money.error} onRetry={() => void money.refetch()}>
      {data && (
        <>
          <WhatWeOwe data={data} />
          <Spending data={data} />
        </>
      )}
    </MoneyColumn>
  );
}
