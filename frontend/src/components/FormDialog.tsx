import { Dialog } from "radix-ui";
import type { FormEvent, ReactNode } from "react";

type Props = {
  title: string;
  submitLabel: string;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
};

export function FormDialog({ title, submitLabel, pending, onClose, onSubmit, children }: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    // React passes events up through portals, so without this, saving a dialog
    // opened from inside another form would submit that form too.
    event.stopPropagation();
    onSubmit(event);
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 grid animate-fade-in place-items-center overflow-y-auto bg-ink/40 p-6">
          <Dialog.Content
            aria-describedby={undefined}
            className="w-full max-w-[520px] rounded-panel bg-panel p-6 shadow-[0_12px_40px_rgba(7,59,76,0.24)]"
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
