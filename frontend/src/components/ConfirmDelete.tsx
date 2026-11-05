import { Confirm } from "./Confirm";

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

/** A delete's dialog, which waits for the counts of what's linked before it lets the delete go ahead. */
export function ConfirmDelete({ message, checkFailed, pending, ...props }: Props) {
  return (
    <Confirm
      {...props}
      tone="danger"
      message={message ?? (checkFailed ? CHECK_FAILED : "Checking what's linked…")}
      disabled={pending || message === null}
    />
  );
}
