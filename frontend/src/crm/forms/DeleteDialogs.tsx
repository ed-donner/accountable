import { toast } from "sonner";

import { ConfirmDelete } from "../../components/ConfirmDelete";
import { money } from "../../lib/money";
import { useDeleteImpact, useDeleteRecord } from "../../lib/records";
import { plural } from "../../lib/words";
import { useDeleteActivity, type ContactImpact, type DealImpact, type OrganizationImpact } from "../queries";

const FINAL = "This can't be undone.";

type Props = { id: number; name: string; onClose: () => void; onDeleted?: () => void };

function useRemove(kind: "organizations" | "contacts" | "deals", word: string, { id, onClose, onDeleted }: Props) {
  const remove = useDeleteRecord(kind, id);
  return {
    pending: remove.isPending,
    confirm: async () => {
      try {
        await remove.mutateAsync();
        toast.success(`${word} deleted.`);
        onClose();
        onDeleted?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    },
  };
}

export function DeleteOrganization(props: Props) {
  const impact = useDeleteImpact<OrganizationImpact>("organizations", props.id);
  const { pending, confirm } = useRemove("organizations", "Organization", props);
  const message =
    impact.data &&
    `Its ${plural(impact.data.contacts, "contact")} and ${plural(impact.data.deals, "deal")} will stay, with no organization. ${FINAL}`;
  return (
    <ConfirmDelete
      title={`Delete ${props.name}?`}
      message={message ?? null}
      checkFailed={impact.isError}
      confirmLabel="Delete organization"
      pending={pending}
      onConfirm={confirm}
      onClose={props.onClose}
    />
  );
}

export function DeleteContact(props: Props) {
  const impact = useDeleteImpact<ContactImpact>("contacts", props.id);
  const { pending, confirm } = useRemove("contacts", "Contact", props);
  const message =
    impact.data &&
    `Their ${plural(impact.data.deals, "deal")} will stay, with no main contact. ${plural(impact.data.activities, "activity")} logged on this contact will be deleted. ${FINAL}`;
  return (
    <ConfirmDelete
      title={`Delete ${props.name}?`}
      message={message ?? null}
      checkFailed={impact.isError}
      confirmLabel="Delete contact"
      pending={pending}
      onConfirm={confirm}
      onClose={props.onClose}
    />
  );
}

export function DeleteDeal(props: Props) {
  const impact = useDeleteImpact<DealImpact>("deals", props.id);
  const { pending, confirm } = useRemove("deals", "Deal", props);
  const won = impact.data?.won ? ` Its revenue of ${money(impact.data.value)} will leave the dashboard.` : "";
  const message =
    impact.data &&
    `Its ${plural(impact.data.activities, "activity")} and ${plural(impact.data.stage_changes, "stage-change entry")} will be deleted.${won} ${FINAL}`;
  return (
    <ConfirmDelete
      title={`Delete ${props.name}?`}
      message={message ?? null}
      checkFailed={impact.isError}
      confirmLabel="Delete deal"
      pending={pending}
      onConfirm={confirm}
      onClose={props.onClose}
    />
  );
}

export function DeleteActivity({ id, description, onClose }: { id: number; description: string; onClose: () => void }) {
  const remove = useDeleteActivity();
  return (
    <ConfirmDelete
      title={`Delete "${description}"?`}
      message={`It will be removed from every timeline and from the dashboard. ${FINAL}`}
      confirmLabel="Delete activity"
      pending={remove.isPending}
      onConfirm={async () => {
        try {
          await remove.mutateAsync(id);
          toast.success("Activity deleted.");
          onClose();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Something went wrong.");
        }
      }}
      onClose={onClose}
    />
  );
}
