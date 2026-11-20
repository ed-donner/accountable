import { Link } from "react-router";
import { toast } from "sonner";
import { useDeleteActivity } from "@/api/activities";
import { ApiError } from "@/api/client";
import { useContactImpact, useDeleteContact } from "@/api/contacts";
import { useDealImpact, useDeleteDeal } from "@/api/deals";
import { useDeleteOrganization, useOrganizationImpact } from "@/api/organizations";
import type { TimelineEntry } from "@/api/types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/Badges";
import { Placeholder } from "@/components/states";
import { money } from "@/lib/format";
import {
  activityDelete,
  contactDelete,
  dealDelete,
  messages,
  organizationBlocked,
  organizationDelete,
  type DeleteWords,
} from "@/lib/words";

export type DeleteTarget =
  | { kind: "organization"; id: number; name: string }
  | { kind: "contact"; id: number; name: string }
  | { kind: "deal"; id: number; name: string }
  | { kind: "activity"; entry: TimelineEntry };

type Props = {
  target: DeleteTarget | null;
  onOpenChange: (open: boolean) => void;
  /** After the delete, such as going back to the table (DEL-7). */
  onDeleted?: () => void;
};

const LABELS = { organization: "Organization", contact: "Contact", deal: "Deal", activity: "Activity" } as const;

/** Asks first, and says what will happen to the linked records (spec 1.10). */
export function DeleteDialog({ target, onOpenChange, onDeleted }: Props) {
  const open = target !== null;
  const id = target && target.kind !== "activity" ? target.id : Number.NaN;
  const orgImpact = useOrganizationImpact(id, open && target?.kind === "organization");
  const contactImpact = useContactImpact(id, open && target?.kind === "contact");
  const dealImpact = useDealImpact(id, open && target?.kind === "deal");

  const deleteOrganization = useDeleteOrganization();
  const deleteContact = useDeleteContact();
  const deleteDeal = useDeleteDeal();
  const deleteActivity = useDeleteActivity();
  const pending =
    deleteOrganization.isPending || deleteContact.isPending || deleteDeal.isPending || deleteActivity.isPending;

  let words: DeleteWords | null = null;
  let blockedDeals = orgImpact.data?.deals ?? [];
  if (target?.kind === "organization" && orgImpact.data) {
    words =
      orgImpact.data.deals.length > 0
        ? organizationBlocked(target.name)
        : organizationDelete(target.name, orgImpact.data.contacts);
  } else if (target?.kind === "contact" && contactImpact.data) {
    words = contactDelete(
      target.name,
      contactImpact.data.activities,
      contactImpact.data.deals.map((deal) => deal.name),
    );
  } else if (target?.kind === "deal" && dealImpact.data) {
    words = dealDelete(target.name, dealImpact.data.activities, dealImpact.data.stage_changes);
  } else if (target?.kind === "activity") {
    words = activityDelete(target.entry.type, target.entry.occurred_at);
  }
  if (target?.kind !== "organization") blockedDeals = [];
  const blocked = blockedDeals.length > 0;

  function confirm() {
    if (!target) return;
    const done = {
      onSuccess: () => {
        toast.success(messages.deleted(LABELS[target.kind]));
        onOpenChange(false);
        onDeleted?.();
      },
      onError: (error: unknown) => {
        toast.error(error instanceof ApiError && error.status === 409 ? error.message : messages.deleteFailed);
      },
    };
    if (target.kind === "organization") deleteOrganization.mutate(target.id, done);
    if (target.kind === "contact") deleteContact.mutate(target.id, done);
    if (target.kind === "deal") deleteDeal.mutate(target.id, done);
    if (target.kind === "activity") deleteActivity.mutate(target.entry.id, done);
  }

  const fallbackTitle = target ? (target.kind === "activity" ? "Delete this activity?" : `Delete ${target.name}?`) : "";

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{words?.title ?? fallbackTitle}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-2">
              {words === null && (
                <>
                  <Placeholder className="h-4 w-full" />
                  <Placeholder className="h-4 w-2/3" />
                </>
              )}
              {words?.lines.map((line) => <p key={line}>{line}</p>)}
              {words !== null && words.lines.length === 0 && !blocked && <p>This can't be undone.</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {blocked && (
          <ul className="grid gap-1 rounded-lg bg-page p-2">
            {blockedDeals.map((deal) => (
              <li key={deal.id}>
                <Link
                  to={`/deals/${deal.id}`}
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-panel"
                >
                  <span className="font-medium text-cerulean-text">{deal.name}</span>
                  <StageBadge stage={deal.stage} />
                  <span className="ml-auto font-mono text-[13px] text-ink tabular">{money(deal.value)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <AlertDialogFooter>
          {blocked ? (
            <AlertDialogCancel>Close</AlertDialogCancel>
          ) : (
            <>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <Button variant="delete" onClick={confirm} disabled={pending || words === null}>
                Delete {target ? LABELS[target.kind].toLowerCase() : ""}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
