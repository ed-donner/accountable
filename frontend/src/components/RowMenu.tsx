import * as Menu from '@radix-ui/react-dropdown-menu'
import { Ellipsis } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import styles from './RowMenu.module.css'

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode }

/** The ⋯ menu on table rows, cards and timeline entries, reachable by keyboard (D18). */
export function RowMenu({ label, items, heading }: { label: string; items: MenuItem[]; heading?: string }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const pending = useRef<(() => void) | null>(null)

  return (
    <Menu.Root modal={false}>
      {/* Keys and pointer presses on the button stay here, so they never pick up a draggable card. */}
      <Menu.Trigger
        ref={trigger}
        className="icon-btn"
        aria-label={label}
        onKeyDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Ellipsis size={18} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className={styles.menu}
          align="end"
          sideOffset={4}
          // The chosen action runs once focus is back on the ⋯ button, so a dialog it opens
          // keeps focus and later returns it to the button (R57).
          onCloseAutoFocus={(event) => {
            const run = pending.current
            if (!run) return
            pending.current = null
            event.preventDefault()
            trigger.current?.focus()
            run()
          }}
        >
          {heading && <Menu.Label className={styles.heading}>{heading}</Menu.Label>}
          {items.map((item) => (
            <Menu.Item
              key={item.label}
              className={`${styles.item} ${item.danger ? styles.danger : ''}`}
              onSelect={() => {
                pending.current = item.onSelect
              }}
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
