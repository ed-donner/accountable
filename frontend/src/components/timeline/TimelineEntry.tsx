import { useId } from "react";
import { ArrowRight, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useChangeActivity } from "@/api/activities";
import type { TimelineEntry as Entry } from "@/api/types";
import { RecordLink } from "@/components/links";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, formatDateTime } from "@/lib/format";
import { messages } from "@/lib/words";
import { cn } from "@/lib/utils";
import { ACTIVITY_ICONS as ICONS, ACTIVITY_NAMES as TYPE_NAMES } from "./activityTypes";

type Props = {
  entry: Entry;
  today: string | undefined;
  /** Name the deal, with a link, for entries from a deal on a contact's timeline (ACT-3). */
  showDeal: boolean;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
};

export function TimelineEntry({ entry, today, showDeal, onEdit, onDelete }: Props) {
  const change = useChangeActivity();
  const doneId = useId();
  const Icon = ICONS[entry.type];
  const dealLink =
    showDeal && entry.deal ? (
      <RecordLink to={`/deals/${entry.deal.id}`} className="text-[13px]">
        {entry.deal.name}
      </RecordLink>
    ) : null;

  // A stage change is a single quieter line with no buttons (spec 2.5, ACT-4).
  if (entry.type === "stage_change") {
    return (
      <li className="flex items-center gap-3 py-3 text-[13px] text-ink-muted" data-entry-type="stage_change">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-band text-sea-green" aria-hidden>
          <ArrowRight className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink">{entry.description}</span>
          {dealLink && <span className="ml-2">{dealLink}</span>}
        </span>
        <time dateTime={entry.occurred_at} className="shrink-0 font-mono text-[12px] tabular">
          {formatDateTime(entry.occurred_at)}
        </time>
      </li>
    );
  }

  const overdue = !!(entry.follow_up_date && !entry.done && today && entry.follow_up_date < today);

  function toggleDone(done: boolean) {
    change.mutate({ id: entry.id, changes: { done } }, { onError: () => toast.error(messages.saveFailed) });
  }

  return (
    <li className="flex gap-3 py-3.5" data-entry-type={entry.type}>
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-icon-bg text-ink-muted"
        aria-hidden
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-medium text-ink">{TYPE_NAMES[entry.type]}</span>
          <time dateTime={entry.occurred_at} className="font-mono text-[12px] text-ink-subtle tabular">
            {formatDateTime(entry.occurred_at)}
          </time>
          {dealLink}
          <span className="ml-auto flex">
            <EntryButton label={`Edit this ${TYPE_NAMES[entry.type].toLowerCase()}`} onClick={() => onEdit(entry)}>
              <Pencil />
            </EntryButton>
            <EntryButton label={`Delete this ${TYPE_NAMES[entry.type].toLowerCase()}`} onClick={() => onDelete(entry)}>
              <Trash2 />
            </EntryButton>
          </span>
        </div>
        {/* Shown as text, keeping its line breaks, never as HTML. */}
        <p className="mt-1 text-[14px] leading-5 break-words whitespace-pre-wrap text-ink">{entry.description}</p>
        {entry.follow_up_date && (
          <div className="mt-2 flex items-center gap-4 text-[13px]">
            <span className={cn("text-ink-muted", overdue && "font-medium text-raspberry-text")}>
              Follow up {formatDate(entry.follow_up_date)}
              {overdue && " (overdue)"}
            </span>
            <label htmlFor={doneId} className="flex items-center gap-2 text-ink-muted">
              <Checkbox
                id={doneId}
                checked={entry.done}
                onCheckedChange={(checked) => toggleDone(checked === true)}
                disabled={change.isPending}
                aria-label={`Done: ${entry.description.slice(0, 60)}`}
              />
              Done
            </label>
          </div>
        )}
      </div>
    </li>
  );
}

function EntryButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="icon" size="icon" className="size-7" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label.split(" ")[0]}</TooltipContent>
    </Tooltip>
  );
}
