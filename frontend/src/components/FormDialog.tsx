import { Dialog } from "radix-ui";
import { useRef, type FormEvent, type ReactNode } from "react";

type Props = {
  title: string;
  submitLabel: string;
  pending?: boolean;
  onClose: () => void;
  /** Resolves when the save has finished, so a second press can't start another. */
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  children: ReactNode;
};

export function FormDialog({ title, submitLabel, pending, onClose, onSubmit, children }: Props) {
  const saving = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    // React passes events up through portals, so without this, saving a dialog
    // opened from inside another form would submit that form too.
    event.stopPropagation();
    event.preventDefault();
    // The button only disables once the page redraws, which a quick second press
    // can beat. That would add the record twice.
    if (saving.current) return;
    saving.current = true;
    try {
      await onSubmit(event);
    } finally {
      saving.current = false;
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 grid animate-fade-in place-items-center overflow-y-auto bg-veil p-6">
          <Dialog.Content
            aria-describedby={undefined}
            className="w-full max-w-[520px] rounded-panel bg-raised p-6 shadow-(--shadow-dialog)"
          >
            <Dialog.Title className="text-[20px] leading-7 font-semibold">{title}</Dialog.Title>
            <form noValidate onSubmit={submit} className="mt-4 flex flex-col gap-3.5">
              {children}
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {submitLabel}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
