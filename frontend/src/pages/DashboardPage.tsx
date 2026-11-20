import { useDashboard } from "@/api/dashboard";
import { DealsWonChart } from "@/components/dashboard/DealsWonChart";
import { FollowUps } from "@/components/dashboard/FollowUps";
import { Funnel } from "@/components/dashboard/Funnel";
import { HeadlineFigures } from "@/components/dashboard/HeadlineFigures";
import { PipelineStrip } from "@/components/dashboard/PipelineStrip";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Band } from "@/components/layout/Band";
import { PageBody } from "@/components/layout/PageBody";
import { BandPlaceholder, LoadFailed, Panel, Placeholder } from "@/components/states";
import { monthLabel } from "@/lib/dashboard";
import { dashboardDate } from "@/lib/format";

/** The date under the title, in Instrument Serif italic (DASH-1). */
function DateLine({ children }: { children: string }) {
  return <p className="font-serif text-[22px] leading-[30px] text-band-ink-soft italic">{children}</p>;
}

export default function DashboardPage() {
  const dashboard = useDashboard();
  const data = dashboard.data;

  if (dashboard.isError) {
    return (
      <>
        <title>Dashboard · Accountable</title>
        <Band title="Dashboard" />
        <LoadFailed message={dashboard.error.message} />
      </>
    );
  }

  if (!data) {
    // Grey blocks the size of what's coming, so the page doesn't jump (spec 2.10).
    return (
      <>
        <title>Dashboard · Accountable</title>
        <Band title="Dashboard" subtitle={<BandPlaceholder className="mt-1 h-[26px] w-56" />}>
          <div className="mt-8 mb-9 grid grid-cols-4 gap-8">
            {[0, 1, 2, 3].map((i) => (
              <BandPlaceholder key={i} className="h-[92px]" />
            ))}
          </div>
          <BandPlaceholder className="h-[140px]" />
        </Band>
        <PageBody>
          <div className="grid grid-cols-12 gap-6">
            <Panel className="col-span-7">
              <Placeholder className="h-[316px]" />
            </Panel>
            <Panel className="col-span-5">
              <Placeholder className="h-[316px]" />
            </Panel>
            {[0, 1, 2].map((i) => (
              <Panel key={i} className="col-span-4">
                <Placeholder className="h-[340px]" />
              </Panel>
            ))}
          </div>
        </PageBody>
      </>
    );
  }

  const months = data.months.map((m) => ({ ...m, label: monthLabel(m.month) }));
  return (
    <>
      <title>Dashboard · Accountable</title>
      <Band title="Dashboard" subtitle={<DateLine>{dashboardDate(data.today)}</DateLine>}>
        <HeadlineFigures dashboard={data} />
        <PipelineStrip stages={data.open_by_stage} />
      </Band>
      <PageBody>
        <div className="grid grid-cols-12 gap-6">
          <RevenueChart months={months} />
          <DealsWonChart months={months} />
          <Funnel steps={data.funnel} />
          <FollowUps items={data.follow_ups} today={data.today} />
          <RecentActivity entries={data.recent} today={data.today} />
        </div>
      </PageBody>
    </>
  );
}
