import { useState } from "react";
import { toast } from "sonner";
import { useChangeActivity } from "@/api/activities";
import type { FollowUp } from "@/api/types";
import { RecordLink } from "@/components/links";
import { Panel, PanelTitle } from "@/components/states";
import { ACTIVITY_ICONS, ACTIVITY_NAMES } from "@/components/timeline/activityTypes";
import { Checkbox } from "@/components/ui/checkbox";
import { shortDay } from "@/lib/dashboard";
import { dueLabel } from "@/lib/format";
import { messages } from "@/lib/words";

function FollowUpItem({ item, today }: { item: FollowUp; today: string }) {
  const change = useChangeActivity();
  // Ticked at once; the item leaves the list when the dashboard refreshes.
  const [ticked, setTicked] = useState(false);
  const Icon = ACTIVITY_ICONS[item.type];
  const late = item.days_late > 0;
  const target = item.deal
    ? { to: `/deals/${item.deal.id}`, name: item.deal.name }
    : item.contact
      ? { to: `/contacts/${item.contact.id}`, name: item.contact.name }
      : null;

  function tick() {
    setTicked(true);
    change.mutate(
      { id: item.id, changes: { done: true } },
      {
        onError: () => {
          setTicked(false);
          toast.error(messages.saveFailed);
        },
      },
    );
  }

  return (
    <li className="grid grid-cols-[28px_1fr_auto] gap-1.5 py-2.5 [&+&]:shadow-[0_-1px_0_var(--line)]">
      <Checkbox
        checked={ticked}
        onCheckedChange={(checked) => checked === true && tick()}
        disabled={ticked}
        aria-label={`Done: ${item.description}`}
        className="mt-0.5 size-[18px] rounded-full border-[1.5px] border-control-border"
      />
      <div className="min-w-0">
        {/* On one line (DASH-7); the whole description is in the tooltip. */}
        <div className="truncate font-medium text-ink" title={item.description}>
          {item.description}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2.5 text-[13px] text-ink-subtle">
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <Icon className="size-3.5" aria-hidden />
            {ACTIVITY_NAMES[item.type]}
          </span>
          {target && (
            <RecordLink to={target.to} className="truncate">
              {target.name}
            </RecordLink>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end text-[13px] text-ink-muted">
        {late ? (
          <span className="font-semibold whitespace-nowrap text-raspberry-text">{dueLabel(item.follow_up_date!, today)}</span>
        ) : (
          <span className="whitespace-nowrap">{dueLabel(item.follow_up_date!, today)}</span>
        )}
        <span className="font-mono tabular">{shortDay(item.follow_up_date!)}</span>
      </div>
    </li>
  );
}

/** Open follow-ups that are overdue or due in the next 7 days, earliest first (DASH-7). */
export function FollowUps({ items, today }: { items: FollowUp[]; today: string }) {
  return (
    <Panel className="col-span-4" aria-labelledby="follow-ups-title">
      <PanelTitle hint="Overdue and next 7 days" id="follow-ups-title">
        Follow-ups
      </PanelTitle>
      {items.length === 0 ? (
        <p className="py-6 text-center text-ink-subtle">Nothing due in the next 7 days.</p>
      ) : (
        <ul aria-label="Follow-ups" className="-my-2.5 max-h-[460px] overflow-y-auto [scrollbar-width:thin]">
          {items.map((item) => (
            <FollowUpItem key={item.id} item={item} today={today} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
