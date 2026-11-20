import { Link } from "react-router";
import { toast } from "sonner";
import { useDeleteActivity } from "@/api/activities";
import { ApiError } from "@/api/client";
import { useContactImpact, useDeleteContact } from "@/api/contacts";
import { useDealImpact, useDeleteDeal } from "@/api/deals";
import { useDeleteOrganization, useOrganizationImpact } from "@/api/organizations";
import type { ContactImpact, DealImpact, DealSummary, OrganizationImpact, TimelineEntry } from "@/api/types";
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

type Impacts = { organization?: OrganizationImpact; contact?: ContactImpact; deal?: DealImpact };

/** What the dialog says, or null words while the impact loads, and any deals that block the delete. */
type Description = { words: DeleteWords | null; blockedDeals: DealSummary[] };

const LOADING: Description = { words: null, blockedDeals: [] };

const LABELS = { organization: "Organization", contact: "Contact", deal: "Deal", activity: "Activity" } as const;

/** Asks first, and says what will happen to the linked records (spec 1.10). */
export function DeleteDialog({ target, onOpenChange, onDeleted }: Props) {
  const impacts = useImpacts(target);
  const { words, blockedDeals } = describe(target, impacts);
  const { remove, pending } = useRemove({ onOpenChange, onDeleted });
  const blocked = blockedDeals.length > 0;

  return (
    <AlertDialog open={target !== null} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{words?.title ?? fallbackTitle(target)}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-2">
              <DeleteLines words={words} blocked={blocked} />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {blocked && <BlockedDeals deals={blockedDeals} onOpen={() => onOpenChange(false)} />}

        <AlertDialogFooter>
          {blocked ? (
            <AlertDialogCancel>Close</AlertDialogCancel>
          ) : (
            <>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <Button variant="delete" onClick={() => target && remove(target)} disabled={pending || words === null}>
                Delete {target ? LABELS[target.kind].toLowerCase() : ""}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Loads what deleting the target would affect. Only the kind being deleted is fetched. */
function useImpacts(target: DeleteTarget | null): Impacts {
  const id = target && target.kind !== "activity" ? target.id : Number.NaN;
  const organization = useOrganizationImpact(id, target?.kind === "organization").data;
  const contact = useContactImpact(id, target?.kind === "contact").data;
  const deal = useDealImpact(id, target?.kind === "deal").data;
  return { organization, contact, deal };
}

function describe(target: DeleteTarget | null, impacts: Impacts): Description {
  switch (target?.kind) {
    case "organization": {
      const impact = impacts.organization;
      if (!impact) return LOADING;
      if (impact.deals.length > 0) return { words: organizationBlocked(target.name), blockedDeals: impact.deals };
      return { words: organizationDelete(target.name, impact.contacts), blockedDeals: [] };
    }
    case "contact": {
      const impact = impacts.contact;
      if (!impact) return LOADING;
      const dealNames = impact.deals.map((deal) => deal.name);
      return { words: contactDelete(target.name, impact.activities, dealNames), blockedDeals: [] };
    }
    case "deal": {
      const impact = impacts.deal;
      if (!impact) return LOADING;
      return { words: dealDelete(target.name, impact.activities, impact.stage_changes), blockedDeals: [] };
    }
    case "activity":
      return { words: activityDelete(target.entry.type, target.entry.occurred_at), blockedDeals: [] };
    default:
      return LOADING;
  }
}

function fallbackTitle(target: DeleteTarget | null) {
  if (!target) return "";
  return target.kind === "activity" ? "Delete this activity?" : `Delete ${target.name}?`;
}

/** Deletes the target, then closes the dialog with a message, or says why it failed. */
function useRemove({ onOpenChange, onDeleted }: Omit<Props, "target">) {
  const deleteOrganization = useDeleteOrganization();
  const deleteContact = useDeleteContact();
  const deleteDeal = useDeleteDeal();
  const deleteActivity = useDeleteActivity();
  const pending =
    deleteOrganization.isPending || deleteContact.isPending || deleteDeal.isPending || deleteActivity.isPending;

  function remove(target: DeleteTarget) {
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

  return { remove, pending };
}

/** The words, or placeholders while they load. */
function DeleteLines({ words, blocked }: { words: DeleteWords | null; blocked: boolean }) {
  if (words === null) {
    return (
      <>
        <Placeholder className="h-4 w-full" />
        <Placeholder className="h-4 w-2/3" />
      </>
    );
  }
  if (words.lines.length === 0 && !blocked) return <p>This can't be undone.</p>;
  return (
    <>
      {words.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </>
  );
}

/** The deals that stop an organization being deleted, each a link to the deal. */
function BlockedDeals({ deals, onOpen }: { deals: DealSummary[]; onOpen: () => void }) {
  return (
    <ul className="grid gap-1 rounded-lg bg-page p-2">
      {deals.map((deal) => (
        <li key={deal.id}>
          <Link
            to={`/deals/${deal.id}`}
            onClick={onOpen}
            className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-panel"
          >
            <span className="font-medium text-cerulean-text">{deal.name}</span>
            <StageBadge stage={deal.stage} />
            <span className="ml-auto font-mono text-[13px] text-ink tabular">{money(deal.value)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
