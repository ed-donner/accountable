import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, FileText, Mail, Phone } from 'lucide-react'
import { Link } from 'react-router'
import { ApiError, refreshAll } from '../../api'
import { StageBadge } from '../../components/StageBadge'
import { useToast } from '../../components/Toast'
import { dueText, exactTime, relativeTime, shortDate } from '../../format'
import { setDone, type Activity } from '../activities/api'
import type { Dashboard } from './api'
import styles from './Overview.module.css'

function RecordLink({ a }: { a: Activity }) {
  if (a.deal_id) return <Link to={`/deals/${a.deal_id}`}>{a.deal_name}</Link>
  if (a.contact_id) return <Link to={`/contacts/${a.contact_id}`}>{a.contact_name}</Link>
  return null
}

const GROUPS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due today' },
  { key: 'upcoming', label: 'Upcoming' },
] as const

/** R50: every open follow-up, grouped and soonest first, with a checkbox to mark it done. */
export function FollowUps({ data }: { data: Dashboard }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const total = GROUPS.reduce((n, g) => n + data.follow_ups[g.key].length, 0)

  async function markDone(a: Activity) {
    try {
      await setDone(a.id, true)
      await refreshAll(queryClient)
      toast('Follow-up marked done')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Something went wrong. Try again.', 'error')
    }
  }

  return (
    <section className={`panel ${styles.card}`} aria-labelledby="follow-ups-title">
      <div className="card-head">
        <h2 id="follow-ups-title">Follow-ups</h2>
        <span className="muted">{total} open</span>
      </div>
      {total === 0 && <p className={styles.quiet}>Nothing to follow up. Log an activity with a follow-up date and it shows here.</p>}
      {GROUPS.map(({ key, label }) =>
        data.follow_ups[key].length ? (
          <div key={key} className={styles.group}>
            <h3 className={styles.groupTitle}>
              {label} · {data.follow_ups[key].length}
            </h3>
            <ul className={styles.list}>
              {data.follow_ups[key].map((a) => (
                <li key={a.id} className={styles.item}>
                  <input
                    type="checkbox"
                    className={styles.check}
                    aria-label={`Mark done: ${a.description}`}
                    onChange={() => markDone(a)}
                  />
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>{a.description}</div>
                    <div className={styles.itemSub}>
                      <RecordLink a={a} />
                    </div>
                  </div>
                  <span className={`mono ${styles.when} ${key === 'overdue' ? 'late' : ''}`}>
                    {key === 'upcoming' ? shortDate(a.follow_up_date!) : dueText(data.today, a.follow_up_date!)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  )
}

const ICON = {
  note: { icon: FileText, background: 'var(--coral-tint)', color: 'var(--coral-text)' },
  call: { icon: Phone, background: 'var(--sea-green-tint)', color: 'var(--sea-green-text)' },
  email: { icon: Mail, background: 'var(--marigold-tint)', color: 'var(--marigold-text)' },
  stage_change: { icon: ArrowRight, background: 'var(--cerulean-tint)', color: 'var(--cerulean-solid)' },
}

/** R49: the 10 most recent activities and stage changes, each linking to its record. */
export function RecentActivity({ data }: { data: Dashboard }) {
  return (
    <section className={`panel ${styles.card}`} aria-labelledby="recent-title">
      <div className="card-head">
        <h2 id="recent-title">Recent activity</h2>
        <span className="muted">Newest first</span>
      </div>
      {data.recent_activity.length === 0 && <p className={styles.quiet}>No activity yet.</p>}
      <ul className={styles.list}>
        {data.recent_activity.map((a) => {
          const { icon: Icon, background, color } = ICON[a.kind]
          return (
            <li key={a.id} className={styles.item}>
              <span className={styles.badge} style={{ background, color }} aria-hidden>
                <Icon size={15} />
              </span>
              <div className={styles.itemText}>
                <div className={styles.itemTitle}>
                  {a.kind === 'stage_change' && a.from_stage && a.to_stage ? (
                    <span className={styles.stages} aria-label={a.description}>
                      <StageBadge stage={a.from_stage} />
                      <ArrowRight size={14} aria-hidden />
                      <StageBadge stage={a.to_stage} />
                    </span>
                  ) : (
                    a.description
                  )}
                </div>
                <div className={styles.itemSub}>
                  <RecordLink a={a} /> ·{' '}
                  <time dateTime={a.occurred_at} title={exactTime(a.occurred_at)}>
                    {relativeTime(a.occurred_at)}
                  </time>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
