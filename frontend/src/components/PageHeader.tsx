import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

/** The page title, an optional line under it, and the page's main action at top right (D16). */
export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div>
        <h1>{title}</h1>
        {sub && <p className={styles.sub}>{sub}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
