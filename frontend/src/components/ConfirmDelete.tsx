import { AlertDialog } from "radix-ui";

type Props = {
  title: string;
  message: string | null;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDelete({ title, message, confirmLabel, pending, onConfirm, onClose }: Props) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 grid animate-fade-in place-items-center bg-ink/40 p-6">
          <AlertDialog.Content className="w-full max-w-[460px] rounded-panel bg-panel p-6 shadow-[0_12px_40px_rgba(7,59,76,0.24)]">
            <AlertDialog.Title className="text-[20px] leading-7 font-semibold">{title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 min-h-10">{message ?? "Checking what's linked…"}</AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel className="btn btn-secondary">Cancel</AlertDialog.Cancel>
              <button
                type="button"
                className="btn btn-danger"
                disabled={pending || message === null}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
