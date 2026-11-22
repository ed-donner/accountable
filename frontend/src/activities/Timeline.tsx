import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Pencil, Trash2 } from "lucide-react";
import { failureMessage } from "../shared/api";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { FollowUpChip } from "../shared/FollowUpChip";
import { formatDate } from "../shared/format";
import { LoadError, Loading } from "../shared/Loading";
import { SidePanel } from "../shared/SidePanel";
import { useToast } from "../shared/Toast";
import { localToday } from "../shared/today";
import { ActivityIcon } from "./ActivityIcon";
import { LogActivityForm } from "./LogActivityForm";
import { useDeleteActivity, useMarkDone, useTimeline, type TimelineEntry } from "./hooks";

const TYPE_WORDS = { note: "note", call: "call", email: "email" } as const;

type Props = { kind: "contact" | "deal"; id: number };

/** C5, D9: the Log activity form, then everything that happened, newest first. */
export function Timeline({ kind, id }: Props) {
  const toast = useToast();
  const today = localToday();
  const timeline = useTimeline(kind, id);
  const remove = useDeleteActivity();
  const markDone = useMarkDone();
  const [editing, setEditing] = useState<TimelineEntry | null>(null);
  const [deleting, setDeleting] = useState<TimelineEntry | null>(null);
  const closeEdit = useCallback(() => setEditing(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.success("Activity deleted.");
        setDeleting(null);
      },
      onError: (error) => toast.error(failureMessage("delete the activity", error)),
    });
  };

  return (
    <div>
      <LogActivityForm on={kind === "contact" ? { contactId: id } : { dealId: id }} />
      <section className="panel" aria-label="Timeline">
        <div className="panel-head">
          <h2>Timeline</h2>
          <span className="muted">Newest first</span>
        </div>
        {timeline.isPending ? (
          <Loading />
        ) : timeline.isError ? (
          <LoadError error={timeline.error} what="timeline" />
        ) : timeline.data.items.length === 0 ? (
          <div className="empty-state small">
            <p>Nothing logged yet. Use the form above to log a call, email or note.</p>
          </div>
        ) : (
          <ol className="timeline">
            {timeline.data.items.map((entry) => (
              <li key={`${entry.kind}-${entry.id}`}>
                <ActivityIcon kind={entry.kind === "stage_change" ? "stage" : entry.type!} />
                <div className="entry-main">
                  <div>{entry.text}</div>
                  <div className="entry-meta">
                    {entry.deal && kind === "contact" && <Link to={`/deals/${entry.deal.id}`}>{entry.deal.name}</Link>}
                    {entry.follow_up_on && entry.follow_up_status && (
                      <FollowUpChip date={entry.follow_up_on} status={entry.follow_up_status} today={today} />
                    )}
                    {entry.follow_up_status && entry.follow_up_status !== "done" && (
                      <button
                        type="button"
                        className="mini"
                        disabled={markDone.isPending}
                        onClick={() =>
                          markDone.mutate(entry.id, {
                            onSuccess: () => toast.success("Follow-up marked done."),
                            onError: (error) => toast.error(failureMessage("mark the follow-up done", error)),
                          })
                        }
                      >
                        <Check size={13} aria-hidden="true" />
                        Mark done
                      </button>
                    )}
                  </div>
                </div>
                <span className="when">{formatDate(entry.on)}</span>
                <div className="entry-actions">
                  {entry.kind === "activity" && (
                    <>
                    <button type="button" className="icon-btn" aria-label={`Edit ${TYPE_WORDS[entry.type!]}: ${entry.text}`} onClick={() => setEditing(entry)}>
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={`Delete ${TYPE_WORDS[entry.type!]}: ${entry.text}`}
                      onClick={() => setDeleting(entry)}
                    >
                      <Trash2 size={15} />
                    </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <SidePanel title="Edit activity" open={editing !== null} onClose={closeEdit}>
        {editing && <LogActivityForm entry={editing} onSaved={closeEdit} onCancel={closeEdit} />}
      </SidePanel>
      {deleting && (
        <ConfirmDialog
          title="Delete this activity?"
          message={`The ${TYPE_WORDS[deleting.type!]} “${deleting.text}” will be deleted. This can't be undone.`}
          confirmLabel="Delete activity"
          busy={remove.isPending}
          onConfirm={confirmDelete}
          onCancel={closeDelete}
        />
      )}
    </div>
  );
}
