import { useState } from "react";
import type { ActivityTarget } from "@/api/activities";
import { useToday } from "@/api/meta";
import type { TimelineEntry as Entry } from "@/api/types";
import { DeleteDialog, type DeleteTarget } from "@/components/DeleteDialog";
import { ActivityForm } from "@/components/forms/ActivityForm";
import { Panel, PanelTitle, Placeholder } from "@/components/states";
import { messages } from "@/lib/words";
import { LogActivity } from "./LogActivity";
import { TimelineEntry } from "./TimelineEntry";

type Props = {
  target: ActivityTarget;
  entries: Entry[] | undefined;
  /** On a contact's timeline, entries from deals name the deal (ACT-3). */
  showDeals: boolean;
};

/** A contact's or deal's timeline, newest first (ACT-1 to ACT-6). */
export function Timeline({ target, entries, showDeals }: Props) {
  const today = useToday();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const prefix = "contact_id" in target ? `contact-${target.contact_id}` : `deal-${target.deal_id}`;

  return (
    <Panel>
      <PanelTitle>Timeline</PanelTitle>
      <LogActivity target={target} idPrefix={prefix} />
      {entries === undefined && (
        <div className="mt-4 grid gap-3">
          <Placeholder className="h-12" />
          <Placeholder className="h-12" />
        </div>
      )}
      {entries?.length === 0 && <p className="mt-6 text-[14px] text-ink-muted">{messages.emptyTimeline}</p>}
      {entries && entries.length > 0 && (
        <ol aria-label="Timeline entries" className="mt-2 divide-y divide-line">
          {entries.map((entry) => (
            <TimelineEntry
              key={entry.id}
              entry={entry}
              today={today}
              showDeal={showDeals}
              onEdit={setEditing}
              onDelete={(item) => setDeleting({ kind: "activity", entry: item })}
            />
          ))}
        </ol>
      )}
      <ActivityForm entry={editing} onOpenChange={(open) => !open && setEditing(null)} />
      <DeleteDialog target={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </Panel>
  );
}
