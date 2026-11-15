import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '../api'
import styles from './Dialogs.module.css'
import { useReturnFocus } from './useReturnFocus'

export type DeletePreview = { blocked: boolean; message: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Where to ask what deleting will do (R26). Or give a fixed `message`. */
  previewPath?: string
  message?: string
  onConfirm: () => Promise<unknown>
}

/**
 * Every delete asks first and says what will happen to linked records (R26, D22).
 * A blocked delete explains why and only offers Close (R27).
 */
export function ConfirmDialog({ open, onOpenChange, title, previewPath, message, onConfirm }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const returnFocus = useReturnFocus(open)
  const preview = useQuery({
    queryKey: ['delete-preview', previewPath],
    queryFn: () => api<DeletePreview>(previewPath!),
    // Off while deleting: the refresh after a delete must not ask for the deleted record (R59).
    enabled: open && !!previewPath && !busy,
    gcTime: 0,
    staleTime: 0,
  })
  const text = message ?? preview.data?.message
  const blocked = preview.data?.blocked ?? false
  const loading = !!previewPath && !preview.data && !preview.error

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} role="alertdialog" onCloseAutoFocus={returnFocus}>
          <div className={styles.head}>
            <Dialog.Title asChild>
              <h2>{blocked ? "Can't delete yet" : title}</h2>
            </Dialog.Title>
          </div>
          <div className={styles.body}>
            <Dialog.Description className={styles.message}>
              {loading ? 'Checking what this affects…' : preview.error ? 'Something went wrong. Try again.' : text}
            </Dialog.Description>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </div>
          <div className={styles.foot}>
            {blocked ? (
              <Dialog.Close className="btn btn-quiet">Close</Dialog.Close>
            ) : (
              <>
                <Dialog.Close className="btn btn-quiet">Cancel</Dialog.Close>
                <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy || loading}>
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
