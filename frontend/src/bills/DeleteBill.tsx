import { ConfirmDelete } from "../components/ConfirmDelete";
import { useNotify } from "../lib/notify";
import { useDeleteRecord } from "../lib/records";
import type { Bill } from "./queries";

type Props = {
  bill: Pick<Bill, "id" | "bill_number" | "organization">;
  onClose: () => void;
  onDeleted?: () => void;
};

/** Asks first, naming the bill and its supplier. Nothing else goes with it, so there's nothing to count (E17). */
export function DeleteBill({ bill, onClose, onDeleted }: Props) {
  const remove = useDeleteRecord("bills", bill.id);
  const notify = useNotify();

  async function confirm() {
    try {
      await remove.mutateAsync();
      notify.success("Bill deleted.");
      onClose();
      onDeleted?.();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  return (
    <ConfirmDelete
      title={`Delete bill ${bill.bill_number} from ${bill.organization.name}?`}
      message="It will leave the dashboard's Money section. This can't be undone."
      confirmLabel="Delete bill"
      pending={remove.isPending}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
