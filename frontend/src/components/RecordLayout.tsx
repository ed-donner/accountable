import { ArrowLeft } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import styles from './RecordLayout.module.css'

type Props = {
  backTo: string
  backLabel: string
  title: string
  badges?: ReactNode
  facts: { label: string; value: ReactNode }[]
  actions: ReactNode
  left: ReactNode
  right: ReactNode
}

/** A header panel with the name, key facts and actions, then two columns below it (D19). */
export function RecordLayout({ backTo, backLabel, title, badges, facts, actions, left, right }: Props) {
  return (
    <>
      <Link to={backTo} className={styles.back}>
        <ArrowLeft size={16} aria-hidden />
        {backLabel}
      </Link>
      <section className={`panel ${styles.header}`}>
        <div className={styles.titleRow}>
          <div className={styles.title}>
            <h1>{title}</h1>
            {badges}
          </div>
          <div className={styles.actions}>{actions}</div>
        </div>
        <dl className={styles.facts}>
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className={styles.columns}>
        <div className={styles.column}>{left}</div>
        <div className={styles.column}>{right}</div>
      </div>
    </>
  )
}

/** A white panel with a heading, used for linked records and the timeline. */
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section className={`panel ${styles.section}`} aria-labelledby={id}>
      <div className="card-head">
        <h2 id={id}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** A list of linked records: a link and a few details on each line. */
export function LinkList({ items, empty }: { items: { key: number; link: ReactNode; detail?: ReactNode; extra?: ReactNode }[]; empty: string }) {
  if (items.length === 0) return <p className="muted">{empty}</p>
  return (
    <ul className={styles.links}>
      {items.map((item) => (
        <li key={item.key}>
          <div>
            {item.link}
            {item.detail && <div className={styles.detail}>{item.detail}</div>}
          </div>
          {item.extra && <div className={styles.extra}>{item.extra}</div>}
        </li>
      ))}
    </ul>
  )
}
