import type { TimelineEntry } from "@/api/types";
import { RecordLink } from "@/components/links";
import { Panel, PanelTitle } from "@/components/states";
import { ACTIVITY_ICONS } from "@/components/timeline/activityTypes";
import { recentWhen } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { LIST_SCROLL } from "./listStyle";

/** The latest 10 entries, stage changes included, each linking to its contact or deal (DASH-8). */
export function RecentActivity({ entries, today }: { entries: TimelineEntry[]; today: string }) {
  return (
    <Panel aria-labelledby="recent-title">
      <PanelTitle id="recent-title">Recent activity</PanelTitle>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-ink-subtle">Nothing logged yet.</p>
      ) : (
        <ul aria-label="Recent activity" className={LIST_SCROLL}>
          {entries.map((entry) => {
            const Icon = ACTIVITY_ICONS[entry.type];
            const stage = entry.type === "stage_change";
            const target = entry.deal
              ? { to: `/deals/${entry.deal.id}`, name: entry.deal.name }
              : entry.contact
                ? { to: `/contacts/${entry.contact.id}`, name: entry.contact.name }
                : null;
            return (
              <li
                key={entry.id}
                className="grid grid-cols-[38px_1fr] py-2.5 [&+&]:shadow-[0_-1px_0_var(--line)]"
                data-entry-type={entry.type}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 place-items-center rounded-full",
                    stage ? "bg-band text-sea-green" : "bg-icon-bg text-ink-muted",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  {/* Shown as text, never as HTML; long ones stop after two lines. */}
                  <div className="line-clamp-2 break-words text-ink">{entry.description}</div>
                  <div className="mt-0.5 flex justify-between gap-2 text-[13px]">
                    {target ? (
                      <RecordLink to={target.to} className="truncate">
                        {target.name}
                      </RecordLink>
                    ) : (
                      <span />
                    )}
                    <time dateTime={entry.occurred_at} className="shrink-0 whitespace-nowrap text-ink-subtle">
                      {recentWhen(entry.occurred_at, today)}
                    </time>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
