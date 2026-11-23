import { Link } from "react-router-dom";
import { longDate } from "../shared/format";
import { LoadError, Loading } from "../shared/Loading";
import { PageHeader } from "../shared/PageHeader";
import { localToday } from "../shared/today";
import { RevenueChart, WonLostChart } from "./Charts";
import { Funnel } from "./Funnel";
import { FollowUps, RecentActivity } from "./Lists";
import { StageBars } from "./StageBars";
import { Tiles } from "./Tiles";
import { useDashboard } from "./hooks";

/** The landing page: how sales are going at a glance (H1 to H8). */
export function DashboardPage() {
  const today = localToday();
  const query = useDashboard();
  return (
    <>
      <PageHeader title="Dashboard" summary={longDate(today)} />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadError error={query.error} what="dashboard" />
      ) : (
        <>
          {query.data.headline.open_count === 0 && query.data.recent.length === 0 && (
            <p className="welcome">
              Welcome to Accountable. Add your first deal to see your pipeline take shape.
            </p>
          )}
          <Tiles data={query.data} />
          <div className="dash-grid">
            <section className="panel span-8" aria-label="Revenue won">
              <div className="panel-head">
                <h2>Revenue won</h2>
                <span className="muted">Last 12 months</span>
              </div>
              <RevenueChart months={query.data.months} />
            </section>
            <section className="panel span-4 fill" aria-label="Sales funnel">
              <div className="panel-head">
                <h2>Sales funnel</h2>
                <span className="muted">All deals</span>
              </div>
              <Funnel steps={query.data.funnel} />
            </section>
            <section className="panel span-6" aria-label="Open pipeline by stage">
              <div className="panel-head">
                <h2>Open pipeline by stage</h2>
                <Link to="/pipeline">View board</Link>
              </div>
              <StageBars stages={query.data.pipeline} />
            </section>
            <section className="panel span-6" aria-label="Deals won and lost">
              <div className="panel-head">
                <h2>Deals won and lost</h2>
                <span className="legend">
                  <i style={{ background: "var(--sea-green)" }} />
                  Won <i style={{ background: "var(--coral)" }} />
                  Lost
                </span>
              </div>
              <WonLostChart months={query.data.months} />
            </section>
            <section className="panel span-6" aria-label="Follow-ups" id="follow-ups">
              <div className="panel-head">
                <h2>Follow-ups</h2>
                <span className="muted">Overdue and next 7 days</span>
              </div>
              <FollowUps items={query.data.follow_ups} today={today} />
            </section>
            <section className="panel span-6" aria-label="Recent activity">
              <div className="panel-head">
                <h2>Recent activity</h2>
              </div>
              <RecentActivity items={query.data.recent} today={today} />
            </section>
          </div>
        </>
      )}
    </>
  );
}
