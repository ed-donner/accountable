import { ConfirmDelete } from "../../components/ConfirmDelete";
import { money } from "../../lib/money";
import { useNotify } from "../../lib/notify";
import { useDeleteImpact, useDeleteRecord, type Holding } from "../../lib/records";
import { listed, plural } from "../../lib/words";
import { useDeleteActivity, type ContactImpact, type DealImpact, type OrganizationImpact } from "../queries";

const FINAL = "This can't be undone.";

type Props = { id: number; name: string; onClose: () => void; onDeleted?: () => void };

/** What another area has that holds the record, as the backend says it when it refuses (D4). */
function heldMessage(kind: string, heldBy: Holding[]) {
  return `This ${kind} has ${listed(heldBy.map((held) => plural(held.count, held.noun)))}, so it can't be deleted.`;
}

function useRemove(kind: "organizations" | "contacts" | "deals", word: string, { id, onClose, onDeleted }: Props) {
  const remove = useDeleteRecord(kind, id);
  const notify = useNotify();
  return {
    pending: remove.isPending,
    confirm: async () => {
      try {
        await remove.mutateAsync();
        notify.success(`${word} deleted.`);
        onClose();
        onDeleted?.();
      } catch (error) {
        notify.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    },
  };
}

export function DeleteOrganization(props: Props) {
  const impact = useDeleteImpact<OrganizationImpact>("organizations", props.id);
  const { pending, confirm } = useRemove("organizations", "Organization", props);
  const held = impact.data !== undefined && impact.data.held_by.length > 0;
  const message =
    impact.data &&
    (held
      ? heldMessage("organization", impact.data.held_by)
      : `Its ${plural(impact.data.contacts, "contact")} and ${plural(impact.data.deals, "deal")} will stay, with no organization. ${FINAL}`);
  return (
    <ConfirmDelete
      title={held ? `${props.name} can't be deleted` : `Delete ${props.name}?`}
      message={message ?? null}
      checkFailed={impact.isError}
      refused={held}
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
  const held = impact.data !== undefined && impact.data.held_by.length > 0;
  const won = impact.data?.won ? ` Its revenue of ${money(impact.data.value)} will leave the dashboard.` : "";
  const message =
    impact.data &&
    (held
      ? heldMessage("deal", impact.data.held_by)
      : `Its ${plural(impact.data.activities, "activity")} and ${plural(impact.data.stage_changes, "stage-change entry")} will be deleted.${won} ${FINAL}`);
  return (
    <ConfirmDelete
      title={held ? `${props.name} can't be deleted` : `Delete ${props.name}?`}
      message={message ?? null}
      checkFailed={impact.isError}
      refused={held}
      confirmLabel="Delete deal"
      pending={pending}
      onConfirm={confirm}
      onClose={props.onClose}
    />
  );
}

export function DeleteActivity({ id, description, onClose }: { id: number; description: string; onClose: () => void }) {
  const remove = useDeleteActivity();
  const notify = useNotify();
  return (
    <ConfirmDelete
      title={`Delete "${description}"?`}
      message={`It will be removed from every timeline and from the dashboard. ${FINAL}`}
      confirmLabel="Delete activity"
      pending={remove.isPending}
      onConfirm={async () => {
        try {
          await remove.mutateAsync(id);
          notify.success("Activity deleted.");
          onClose();
        } catch (error) {
          notify.error(error instanceof Error ? error.message : "Something went wrong.");
        }
      }}
      onClose={onClose}
    />
  );
}
