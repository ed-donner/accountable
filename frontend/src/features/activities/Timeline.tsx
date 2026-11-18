import { ArrowRight, FileText, Mail, Phone } from 'lucide-react'
import { Link } from 'react-router'
import { RowMenu } from '../../components/RowMenu'
import { StageBadge } from '../../components/StageBadge'
import { exactTime, relativeTime, shortDate } from '../../format'
import { KIND_LABELS, type Activity } from './api'
import styles from './Timeline.module.css'

const ICON = {
  note: { icon: FileText, background: 'var(--coral-tint)', color: 'var(--coral-text)' },
  call: { icon: Phone, background: 'var(--sea-green-tint)', color: 'var(--sea-green-text)' },
  email: { icon: Mail, background: 'var(--marigold-tint)', color: 'var(--marigold-text)' },
  stage_change: { icon: ArrowRight, background: 'var(--cerulean-tint)', color: 'var(--cerulean-solid)' },
}

type Props = {
  entries: Activity[]
  /** Which record's timeline this is, so the link shown is to the other record. */
  showLinkTo: 'contact' | 'deal'
  onEdit: (a: Activity) => void
  onDelete: (a: Activity) => void
  onToggleDone: (a: Activity, done: boolean) => void
}

/** Newest first: icon, description, time, follow-up chip and done checkbox (R34, R37, D20). */
export function Timeline({ entries, showLinkTo, onEdit, onDelete, onToggleDone }: Props) {
  if (entries.length === 0) return <p className="muted">Nothing logged yet.</p>
  return (
    <ol className={styles.list}>
      {entries.map((a) => {
        const { icon: Icon, background, color } = ICON[a.kind]
        const link =
          showLinkTo === 'deal' && a.deal_id ? (
            <Link to={`/deals/${a.deal_id}`}>{a.deal_name}</Link>
          ) : showLinkTo === 'contact' && a.contact_id ? (
            <Link to={`/contacts/${a.contact_id}`}>{a.contact_name}</Link>
          ) : null
        return (
          <li key={a.id} className={styles.entry}>
            <span className={styles.icon} style={{ background, color }}>
              <Icon size={15} aria-hidden />
              <span className="visually-hidden">{KIND_LABELS[a.kind]}</span>
            </span>
            <div className={styles.body}>
              <div className={styles.text}>
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
              <div className={styles.meta}>
                <time dateTime={a.occurred_at} title={exactTime(a.occurred_at)}>
                  {relativeTime(a.occurred_at)}
                </time>
                {link && <> · {link}</>}
              </div>
              {a.follow_up_date && (
                <label className={styles.followUp}>
                  <input type="checkbox" checked={a.done} onChange={(e) => onToggleDone(a, e.target.checked)} />
                  <span className={`${styles.chip} ${a.follow_up_state === 'overdue' ? styles.overdue : ''} ${a.done ? styles.done : ''}`}>
                    Follow up {shortDate(a.follow_up_date)}
                    {a.follow_up_state === 'overdue' && ' · overdue'}
                    {a.done && ' · done'}
                  </span>
                  <span className="visually-hidden">Mark done</span>
                </label>
              )}
            </div>
            {a.kind !== 'stage_change' && (
              <RowMenu
                label={`Actions for ${KIND_LABELS[a.kind].toLowerCase()}: ${a.description}`}
                items={[
                  { label: 'Edit', onSelect: () => onEdit(a) },
                  { label: 'Delete', danger: true, onSelect: () => onDelete(a) },
                ]}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
