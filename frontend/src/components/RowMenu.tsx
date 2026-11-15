import * as Menu from '@radix-ui/react-dropdown-menu'
import { Ellipsis } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './RowMenu.module.css'

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode }

/** The ⋯ menu on table rows, cards and timeline entries, reachable by keyboard (D18). */
export function RowMenu({ label, items, heading }: { label: string; items: MenuItem[]; heading?: string }) {
  return (
    <Menu.Root modal={false}>
      {/* Keys and pointer presses on the button stay here, so they never pick up a draggable card. */}
      <Menu.Trigger
        className="icon-btn"
        aria-label={label}
        onKeyDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Ellipsis size={18} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={styles.menu} align="end" sideOffset={4}>
          {heading && <Menu.Label className={styles.heading}>{heading}</Menu.Label>}
          {items.map((item) => (
            <Menu.Item
              key={item.label}
              className={`${styles.item} ${item.danger ? styles.danger : ''}`}
              // Run the action once the menu has closed and focus is back on the ⋯ button,
              // so a dialog it opens returns focus there (R57).
              onSelect={() => setTimeout(item.onSelect, 0)}
            >
              {item.icon}
              {item.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
