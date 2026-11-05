import { AlertDialog } from "radix-ui";
import { useRef, type ReactNode } from "react";

type Props = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  /** Danger, in Raspberry, for a delete. Anything else that can't be undone, such as sending a quote, is primary. */
  tone: "primary" | "danger";
  /** Something stops it going ahead, which the message says, so the dialog offers only Close (D4). */
  refused?: boolean;
  /** The confirm button waits, such as while a delete's counts are read or the change is under way. */
  disabled?: boolean;
  /** Resolves when the change has finished, so a second press can't start another. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

/** Asks before something that can't be undone, such as a delete or sending a quote. */
export function Confirm({ title, message, confirmLabel, tone, refused, disabled, onConfirm, onClose }: Props) {
  const confirming = useRef(false);

  async function confirm() {
    // The button only disables once the page redraws, which a quick second press can beat.
    if (confirming.current) return;
    confirming.current = true;
    try {
      await onConfirm();
    } finally {
      confirming.current = false;
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
            <AlertDialog.Description className="mt-2 min-h-10">{message}</AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel className="btn btn-secondary">{refused ? "Close" : "Cancel"}</AlertDialog.Cancel>
              {!refused && (
                <button
                  type="button"
                  className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
                  disabled={disabled}
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
