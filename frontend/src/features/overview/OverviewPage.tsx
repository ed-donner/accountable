import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { STAGE_COLOR } from '../../components/StageBadge'
import { longDate, money } from '../../format'
import { DealForm } from '../deals/DealForm'
import { useDashboard } from './api'
import { DealsWonChart, FunnelGraph, RevenueChart } from './Charts'
import { FollowUps, RecentActivity } from './Lists'
import styles from './Overview.module.css'

/** The landing page (D17, direction B). Every figure comes from the current data (R51). */
export function OverviewPage() {
  const { data, error } = useDashboard()
  const [adding, setAdding] = useState(false)

  const header = (
    <PageHeader
      title="Overview"
      actions={
        <>
          {data && <span className="muted">{longDate(data.today)}</span>}
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden />
            New deal
          </button>
        </>
      }
    />
  )
  const form = <DealForm open={adding} onOpenChange={setAdding} />

  if (error)
    return (
      <>
        {header}
        <p className="empty" role="alert">
          Couldn't load the figures. Refresh the page to try again.
        </p>
      </>
    )
  if (!data)
    return (
      <>
        {header}
        <p className="empty">Loading…</p>
      </>
    )

  const totalOpen = data.open_by_stage.reduce((n, s) => n + s.value_cents, 0)

  return (
    <>
      {header}
      <section className={styles.hero} aria-label="Headline figures">
        <div>
          <div className={styles.heroLabel}>Open pipeline</div>
          <div className={`mono ${styles.big}`} data-testid="tile-open-value">
            {money(data.open_value_cents)}
          </div>
          <div className={styles.heroNote}>{data.open_count === 1 ? '1 open deal' : `${data.open_count} open deals`}</div>
        </div>
        <div>
          <div className={styles.heroLabel}>Expected revenue</div>
          <div className={`mono ${styles.big} ${styles.green}`} data-testid="tile-expected">
            {money(data.open_expected_cents)}
          </div>
          <div className={styles.minis}>
            <div>
              Won this month
              <b className="mono" data-testid="tile-won-month">
                {money(data.won_this_month.revenue_cents)}
              </b>
            </div>
            <div>
              Win rate, 12 months
              <b className="mono" data-testid="tile-win-rate">
                {data.win_rate === null ? '—' : `${data.win_rate}%`}
              </b>
            </div>
          </div>
        </div>
        <div className={styles.byStage}>
          <div className={styles.heroLabel}>Open value by stage</div>
          <div className={styles.stackBar} aria-hidden>
            {data.open_by_stage.map((s) => (
              <div key={s.stage} style={{ flex: totalOpen ? Math.max(s.value_cents, 1) : 1, background: STAGE_COLOR[s.stage] }} />
            ))}
          </div>
          <div className={styles.legend}>
            {data.open_by_stage.map((s) => (
              <div key={s.stage}>
                <span className={styles.legendKey}>
                  <span className={styles.dot} style={{ background: STAGE_COLOR[s.stage] }} aria-hidden />
                  {s.stage} · {s.count}
                </span>
                <b className="mono">{money(s.value_cents)}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.row2}>
        <section className={`panel ${styles.card}`} aria-labelledby="revenue-title">
          <div className="card-head">
            <h2 id="revenue-title">Revenue won</h2>
            <span className="muted">Last 12 months · USD</span>
          </div>
          <div className={styles.total}>
            <span className="mono">{money(data.won_value_last_12_cents)}</span>
            <span className={styles.chip}>{data.won_last_12 === 1 ? '1 deal won' : `${data.won_last_12} deals won`}</span>
          </div>
          <RevenueChart monthly={data.monthly} />
        </section>
        <section className={`panel ${styles.card}`} aria-labelledby="funnel-title">
          <div className="card-head">
            <h2 id="funnel-title">Sales funnel</h2>
            <span className="muted">Value reaching each stage</span>
          </div>
          <FunnelGraph funnel={data.funnel} />
        </section>
      </div>

      <div className={styles.row3}>
        <section className={`panel ${styles.card}`} aria-labelledby="won-title">
          <div className="card-head">
            <h2 id="won-title">Deals won</h2>
            <span className="muted">Per month</span>
          </div>
          <DealsWonChart monthly={data.monthly} />
        </section>
        <FollowUps data={data} />
        <RecentActivity data={data} />
      </div>
      {form}
    </>
  )
}
