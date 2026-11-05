import { AlertDialog } from "radix-ui";
import { useRef } from "react";

type Props = {
  title: string;
  message: string | null;
  /** The counts couldn't be read, so the real ones can't be given. */
  checkFailed?: boolean;
  confirmLabel: string;
  /** Something holds the record, which the message says, so the dialog offers only Close (D4). */
  refused?: boolean;
  pending?: boolean;
  /** Resolves when the delete has finished, so a second press can't start another. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

const CHECK_FAILED = "Couldn't check what's linked, so this can't be deleted right now.";

export function ConfirmDelete({
  title,
  message,
  checkFailed,
  confirmLabel,
  refused,
  pending,
  onConfirm,
  onClose,
}: Props) {
  const deleting = useRef(false);

  async function confirm() {
    // The button only disables once the page redraws, which a quick second press can beat.
    if (deleting.current) return;
    deleting.current = true;
    try {
      await onConfirm();
    } finally {
      deleting.current = false;
    }
  }

  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 grid animate-fade-in place-items-center bg-veil p-6">
          <AlertDialog.Content className="w-full max-w-[460px] rounded-panel bg-raised p-6 shadow-(--shadow-dialog)">
            <AlertDialog.Title className="line-clamp-2 text-[20px] leading-7 font-semibold break-words">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 min-h-10">
              {message ?? (checkFailed ? CHECK_FAILED : "Checking what's linked…")}
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel className="btn btn-secondary">{refused ? "Close" : "Cancel"}</AlertDialog.Cancel>
              {!refused && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={pending || message === null}
                  onClick={confirm}
                >
                  {confirmLabel}
                </button>
              )}
            </div>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
