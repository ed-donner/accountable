import { format, parseISO, subMonths } from "date-fns";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Chip } from "../../components/Chip";
import { LoadFailed } from "../../components/LoadFailed";
import { PageHeader } from "../../components/PageHeader";
import { formatDateTime, formatShortDate } from "../../lib/dates";
import { money } from "../../lib/money";
import { plural } from "../../lib/words";
import { DealsWonChart } from "../charts/DealsWonChart";
import { PipelineBand } from "../charts/PipelineBand";
import { RevenueChart } from "../charts/RevenueChart";
import { SalesFunnel } from "../charts/SalesFunnel";
import { useDashboard, useTickFollowUp, type Dashboard as Figures, type FollowUp } from "../queries";
import { EntryIcon, aboutPath } from "../Timeline";

const WON_DEALS = "/deals?stage=won&sort=close_date&dir=desc";

function summaryLine({ overdue_follow_ups, late_deals }: Figures) {
  const followUps = overdue_follow_ups === 0 ? "No follow-ups" : plural(overdue_follow_ups, "follow-up");
  const deals = late_deals === 0 ? "no deals" : plural(late_deals, "deal");
  return `${followUps} overdue and ${deals} running late.`;
}

function ChartEmpty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-muted">{children}</div>;
}

function Stat({ to, label, value, context }: { to: string; label: string; value: string; context: string }) {
  return (
    <Link to={to} className="block rounded-control px-1.5">
      <span className="block text-[13px] leading-[18px] font-semibold">{label}</span>
      <span className="num block text-[24px] leading-[30px] font-medium tracking-[-0.02em]">{value}</span>
      <span className="block text-[13px] leading-[18px] text-muted">{context}</span>
    </Link>
  );
}

function Hero({ data, month, lastMonth }: { data: Figures; month: string; lastMonth: string }) {
  const anyWins = data.months.some((item) => item.revenue > 0);
  return (
    <section aria-label="Revenue won" className="panel relative min-h-0 overflow-hidden">
      {anyWins ? (
        <RevenueChart months={data.months} />
      ) : (
        <div className="flex h-full flex-col justify-end">
          <ChartEmpty>Revenue will show here once you've won a deal.</ChartEmpty>
        </div>
      )}
      <Link to={WON_DEALS} className="absolute top-2 left-3 block rounded-card bg-panel py-2 pr-3 pl-2">
        <span className="block text-[14px] leading-5 font-semibold">Revenue won in {month}</span>
        <span className="num block text-[52px] leading-[60px] font-medium tracking-[-0.03em]" data-testid="revenue-this-month">
          {money(data.revenue_this_month)}
        </span>
        <span className="block text-[13px] leading-[18px] text-muted" data-testid="revenue-last-month">
          {lastMonth} {money(data.revenue_last_month)}
        </span>
      </Link>
    </section>
  );
}

function Strip({ data }: { data: Figures }) {
  return (
    <section aria-label="Open pipeline" className="panel grid grid-cols-[182px_170px_minmax(0,1fr)] items-center gap-2 p-3">
      <Stat
        to="/pipeline"
        label="Open pipeline"
        value={money(data.open_pipeline)}
        context={`${plural(data.open_deals, "open deal")}`}
      />
      <Stat
        to="/pipeline"
        label="Expected revenue"
        value={money(data.expected_revenue)}
        context={`${data.expected_share}% of open pipeline`}
      />
      <PipelineBand stages={data.band} />
    </section>
  );
}

function DealsWon({ data, month, lastMonth }: { data: Figures; month: string; lastMonth: string }) {
  const anyWins = data.months.some((item) => item.deals > 0);
  return (
    <section aria-label="Deals won" className="panel flex min-h-0 flex-col px-[18px] py-4">
      <div className="flex items-baseline gap-3">
        <h2>
          <Link to={WON_DEALS} className="rounded">
            Deals won in {month}
          </Link>
        </h2>
        <span className="num text-[24px] leading-[30px] font-medium" data-testid="deals-this-month">
          {data.deals_won_this_month}
        </span>
        <span className="ml-auto text-[13px] whitespace-nowrap text-muted" data-testid="deals-last-month">
          {lastMonth} {data.deals_won_last_month}
        </span>
      </div>
      {anyWins ? <DealsWonChart months={data.months} /> : <ChartEmpty>Wins will show here month by month.</ChartEmpty>}
    </section>
  );
}

function Funnel({ data }: { data: Figures }) {
  return (
    <section aria-label="Sales funnel" className="panel flex min-h-0 flex-col px-[18px] py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2>Sales funnel</h2>
        <span className="truncate text-[13px] text-muted">Value reaching each stage, and the share carried forward</span>
      </div>
      {data.funnel[0].value > 0 ? (
        <SalesFunnel stages={data.funnel} />
      ) : (
        <ChartEmpty>Deals will show here once you've added some.</ChartEmpty>
      )}
    </section>
  );
}

function FollowUpRow({ item, today }: { item: FollowUp; today: string }) {
  const tick = useTickFollowUp();
  return (
    <li className="flex items-center gap-2.5 py-1.5" data-testid="follow-up">
      <input
        type="checkbox"
        className="tick"
        aria-label={`Mark ${item.description} done`}
        onChange={() => tick.mutate({ id: item.id, done: true })}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.description}</div>
        <div className="truncate text-[13px] leading-[18px] text-muted">
          <Link to={aboutPath(item.about)} className="link">
            {item.about.name}
          </Link>
        </div>
      </div>
      {item.overdue && <Chip tone="alert">Overdue</Chip>}
      <span className="num text-[12px] whitespace-nowrap text-muted">
        {item.follow_up_date === today ? "Today" : formatShortDate(item.follow_up_date)}
      </span>
    </li>
  );
}

function FollowUps({ data }: { data: Figures }) {
  const { overdue, upcoming, items } = data.follow_ups;
  return (
    <section aria-label="Follow-ups" className="panel flex min-h-0 flex-col px-[18px] py-4">
      <div className="flex items-baseline justify-between">
        <h2>Follow-ups</h2>
        <span className="text-[13px] text-muted" data-testid="follow-up-counts">
          {overdue} overdue, {upcoming} upcoming
        </span>
      </div>
      {items.length === 0 ? (
        <ChartEmpty>No follow-ups due.</ChartEmpty>
      ) : (
        <ul className="mt-1.5 -mr-2 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-color:var(--color-sea-mist)_transparent] [scrollbar-width:thin]">
          {items.map((item) => (
            <FollowUpRow key={item.id} item={item} today={data.today} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentActivity({ data }: { data: Figures }) {
  return (
    <section aria-label="Recent activity" className="panel flex min-h-0 flex-col px-[18px] py-4">
      <h2>Recent activity</h2>
      {data.recent.length === 0 ? (
        <ChartEmpty>Nothing has happened yet.</ChartEmpty>
      ) : (
        <ul className="mt-1.5 -mr-2 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-color:var(--color-sea-mist)_transparent] [scrollbar-width:thin]">
          {data.recent.map((entry) => (
            <li key={`${entry.kind}-${entry.id}`} className="flex items-center gap-2.5 py-1.5" data-testid="recent-entry">
              <EntryIcon entry={entry} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{entry.description}</div>
                <div className="flex justify-between gap-2.5 text-[13px] leading-[18px] text-muted">
                  <Link to={aboutPath(entry.about)} className="link min-w-0 truncate">
                    {entry.about.name}
                  </Link>
                  <span className="num text-[12px] whitespace-nowrap">{formatDateTime(entry.at)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Dashboard() {
  const dashboard = useDashboard();
  const data = dashboard.data;
  const today = data ? parseISO(data.today) : new Date();
  const month = format(today, "MMMM");
  const lastMonth = format(subMonths(today, 1), "MMMM");

  return (
    <div className="flex h-[calc(100vh-68px)] min-h-[692px] flex-col">
      <PageHeader title="Dashboard" baseline>
        {data && (
          <p className="font-serif text-[22px] leading-[30px]" data-testid="summary">
            {summaryLine(data)}
          </p>
        )}
      </PageHeader>
      <LoadFailed onPage keeping={data !== undefined} error={dashboard.error} onRetry={() => dashboard.refetch()} />
      {data && (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_396px] gap-3 px-5 pb-4">
          <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1.12fr)_auto_minmax(0,1fr)] gap-3">
            <Hero data={data} month={month} lastMonth={lastMonth} />
            <Strip data={data} />
            <div className="grid min-h-0 grid-cols-[minmax(0,0.76fr)_minmax(0,1.24fr)] gap-3">
              <DealsWon data={data} month={month} lastMonth={lastMonth} />
              <Funnel data={data} />
            </div>
          </div>
          <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3">
            <FollowUps data={data} />
            <RecentActivity data={data} />
          </div>
        </div>
      )}
    </div>
  );
}
