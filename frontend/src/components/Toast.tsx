import * as RadixToast from '@radix-ui/react-toast'
import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import styles from './Toast.module.css'

type Tone = 'info' | 'error'
type Item = { id: number; message: string; tone: Tone }

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {})

/** Short confirmations ("Deal saved", D14) and errors such as a failed pipeline move (R44). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const show = useCallback((message: string, tone: Tone = 'info') => {
    setItems((current) => [...current, { id: Date.now() + Math.random(), message, tone }])
  }, [])

  return (
    <RadixToast.Provider duration={4000} swipeDirection="right" label="Notification">
      <ToastContext.Provider value={show}>{children}</ToastContext.Provider>
      {items.map((item) => (
        <RadixToast.Root
          key={item.id}
          type={item.tone === 'error' ? 'foreground' : 'background'}
          className={`${styles.toast} ${item.tone === 'error' ? styles.error : ''}`}
          onOpenChange={(open) => {
            if (!open) setItems((current) => current.filter((i) => i.id !== item.id))
          }}
        >
          <RadixToast.Description>{item.message}</RadixToast.Description>
          <RadixToast.Close className="icon-btn" aria-label="Close">
            <X size={16} aria-hidden />
          </RadixToast.Close>
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className={styles.viewport} />
    </RadixToast.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
