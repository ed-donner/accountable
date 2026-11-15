import { useRef } from 'react'

/**
 * R57: a dialog returns focus to whatever opened it. Our dialogs are opened by state (from buttons,
 * menus and cards), not by a Radix trigger, so we note the focused element as the dialog opens.
 * Pass the result to Radix's `onCloseAutoFocus`.
 */
export function useReturnFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current && typeof document !== 'undefined') {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  wasOpen.current = open
  return (event: Event) => {
    if (opener.current?.isConnected) {
      event.preventDefault()
      opener.current.focus()
    }
  }
}
