import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Chip } from "../components/Chip";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { formatDate, formatDateTime, todayIso } from "../lib/dates";
import { DeleteActivity } from "./forms/DeleteDialogs";
import { EditActivity, LogActivity } from "./forms/ActivityForm";
import { TIMELINE_PAGE, useTickFollowUp, useTimeline, type About, type RecordKind, type TimelineEntry } from "./queries";

const TYPE_STYLES = {
  call: { label: "Call", fill: "bg-sea-green text-ink" },
  email: { label: "Email", fill: "bg-marigold text-ink" },
  note: { label: "Note", fill: "bg-coral text-ink" },
  stage: { label: "Stage change", fill: "bg-cerulean text-white" },
};

export function EntryIcon({ entry }: { entry: Pick<TimelineEntry, "type"> }) {
  const name = entry.type ?? "stage";
  return (
    <span className={`inline-flex size-[30px] flex-none items-center justify-center rounded-full ${TYPE_STYLES[name].fill}`}>
      <Icon name={name} size={16} />
    </span>
  );
}

export function aboutPath(about: About) {
  return about.kind === "deal" ? `/deals/${about.id}` : `/contacts/${about.id}`;
}

function FollowUp({ entry }: { entry: TimelineEntry }) {
  const tick = useTickFollowUp();
  if (!entry.follow_up_date) return null;
  const overdue = !entry.follow_up_done && entry.follow_up_date < todayIso();
  return (
    <label className="mt-1 flex w-fit items-center gap-2 text-[13px] leading-[18px]">
      <input
        type="checkbox"
        className="tick"
        checked={entry.follow_up_done}
        aria-label={`Mark ${entry.description} ${entry.follow_up_done ? "not done" : "done"}`}
        onChange={(event) => tick.mutate({ id: entry.id, done: event.target.checked })}
      />
      <span>Follow up</span>
      <span className="num text-muted">{formatDate(entry.follow_up_date)}</span>
      {entry.follow_up_done && <Chip tone="quiet">Done</Chip>}
      {overdue && <Chip tone="alert">Overdue</Chip>}
    </label>
  );
}

function Entry({ entry, onEdit, onDelete }: { entry: TimelineEntry; onEdit: () => void; onDelete: () => void }) {
  const style = TYPE_STYLES[entry.type ?? "stage"];
  return (
    <li className="flex gap-3 py-2.5" data-testid="timeline-entry">
      <EntryIcon entry={entry} />
      <div className="min-w-0 flex-1">
        <p className="font-medium whitespace-pre-wrap">{entry.description}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-[13px] leading-[18px] text-muted">
          <span>{style.label}</span>
          <span className="num text-[12px]">{formatDateTime(entry.at)}</span>
          <Link to={aboutPath(entry.about)} className="link">
            {entry.about.name}
          </Link>
        </p>
        <FollowUp entry={entry} />
      </div>
      {entry.kind === "activity" && (
        <div className="flex-none whitespace-nowrap">
          <button type="button" className="icon-btn" aria-label={`Edit ${entry.description}`} onClick={onEdit}>
            <Pencil size={16} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" aria-label={`Delete ${entry.description}`} onClick={onDelete}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}

type Props = {
  kind: RecordKind;
  id: number;
  /** Where Log activity saves to. Organizations have no button of their own. */
  logTo?: { contact_id: number } | { deal_id: number };
  empty: string;
};

export function Timeline({ kind, id, logTo, empty }: Props) {
  const [limit, setLimit] = useState(TIMELINE_PAGE);
  const timeline = useTimeline(kind, id, limit);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<TimelineEntry | null>(null);
  const [deleting, setDeleting] = useState<TimelineEntry | null>(null);

  const entries = timeline.data?.entries ?? [];
  const total = timeline.data?.total ?? 0;

  return (
    <section aria-label="Timeline" className="panel px-[18px] py-4">
      <div className="flex items-center justify-between gap-3">
        <h2>Timeline</h2>
        {logTo && (
          <button type="button" className="btn btn-primary" onClick={() => setLogging(true)}>
            Log activity
          </button>
        )}
      </div>

      {timeline.data && entries.length === 0 && <EmptyState message={empty} />}

      <ul className="mt-1">
        {entries.map((entry) => (
          <Entry
            key={`${entry.kind}-${entry.id}`}
            entry={entry}
            onEdit={() => setEditing(entry)}
            onDelete={() => setDeleting(entry)}
          />
        ))}
      </ul>

      {entries.length < total && (
        <div className="mt-2 flex justify-center">
          <button type="button" className="btn btn-secondary" onClick={() => setLimit(limit + TIMELINE_PAGE)}>
            Show more
          </button>
        </div>
      )}

      {logging && logTo && <LogActivity link={logTo} onClose={() => setLogging(false)} />}
      {editing && <EditActivity entry={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteActivity id={deleting.id} onClose={() => setDeleting(null)} />}
    </section>
  );
}
