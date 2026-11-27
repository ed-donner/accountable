import { BriefcaseBusiness, Building, LayoutGrid, SquareKanban, Users } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { isOpenStage, useDeals } from '../features/deals/api'
import styles from './AppShell.module.css'

const SECTIONS = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/pipeline', label: 'Pipeline', icon: SquareKanban, end: false },
  { to: '/deals', label: 'Deals', icon: BriefcaseBusiness, end: false },
  { to: '/contacts', label: 'Contacts', icon: Users, end: false },
  { to: '/organizations', label: 'Organizations', icon: Building, end: false },
]

/** A fixed Midnight sidebar with the five sections; Pipeline shows the open deal count (D16). */
export function AppShell() {
  const deals = useDeals()
  const openCount = deals.data?.filter((d) => isOpenStage(d.stage)).length

  return (
    <div className={styles.shell}>
      <aside className={styles.sideColumn}>
        <div className={styles.side}>
          <div className={styles.brand}>
            <span className={styles.mark} aria-hidden>
              A
            </span>
            Accountable
          </div>
          <nav aria-label="Sections" className={styles.nav}>
            {SECTIONS.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? styles.on : undefined)}>
                <Icon size={18} aria-hidden />
                {label}
                {label === 'Pipeline' && openCount !== undefined && (
                  <span className={styles.count} aria-label={`${openCount} open deals`}>
                    {openCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
