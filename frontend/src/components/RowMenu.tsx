import * as Menu from '@radix-ui/react-dropdown-menu'
import { Ellipsis } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './RowMenu.module.css'

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode }
type Props = { label: string; items: MenuItem[]; heading?: string }

/**
 * The ⋯ menu on table rows, cards and timeline entries, reachable by keyboard (D18).
 * It starts as a plain button and builds the real menu on first use: with about 1,000 cards on
 * the pipeline, a full menu on every card made the board noticeably slow (R56).
 */
export function RowMenu(props: Props) {
  const [armed, setArmed] = useState<null | 'pointer' | 'keyboard'>(null)
  if (armed) return <ArmedMenu {...props} openedBy={armed} />
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={props.label}
      aria-haspopup="menu"
      aria-expanded={false}
      // Keys and pointer presses on the button stay here, so they never pick up a draggable card.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => setArmed('pointer')}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault()
          setArmed('keyboard')
        }
      }}
    >
      <Ellipsis size={18} aria-hidden />
    </button>
  )
}

function ArmedMenu({ label, items, heading, openedBy }: Props & { openedBy: 'pointer' | 'keyboard' }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const pending = useRef<(() => void) | null>(null)

  // Opened from the keyboard: start on the first item, as a menu button should. Only the first
  // opening comes from the plain button; later ones are handled by Radix itself.
  useEffect(() => {
    if (openedBy !== 'keyboard') return
    // After Radix has moved focus to the menu itself.
    const timer = setTimeout(() => content.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 0)
    return () => clearTimeout(timer)
  }, [openedBy])

  return (
    <Menu.Root modal={false} defaultOpen>
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
          ref={content}
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
