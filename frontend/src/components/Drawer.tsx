import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './Dialogs.module.css'
import { useReturnFocus } from './useReturnFocus'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  /** The buttons, shown below the scrolling body. */
  footer: ReactNode
  /** Centred dialog instead of a side drawer (D13: Log activity opens in the centre). */
  centered?: boolean
}

/** Add and edit forms open in a drawer from the right, so the table stays visible (D13). */
export function Drawer({ open, onOpenChange, title, children, footer, centered = false }: Props) {
  const returnFocus = useReturnFocus(open)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={centered ? styles.dialog : styles.drawer}
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocus}
          onOpenAutoFocus={(event) => {
            // Start in the first field rather than on the Close button.
            const field = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('input, select, textarea')
            if (field) {
              event.preventDefault()
              field.focus()
            }
          }}
        >
          <div className={styles.head}>
            <Dialog.Title asChild>
              <h2>{title}</h2>
            </Dialog.Title>
            <Dialog.Close className="icon-btn" aria-label="Close">
              <X size={18} aria-hidden />
            </Dialog.Close>
          </div>
          <div className={styles.body}>{children}</div>
          <div className={styles.foot}>{footer}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
