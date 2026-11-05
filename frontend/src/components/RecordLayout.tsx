import { differenceInSeconds, parseISO } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { formatDate } from "../lib/dates";
import type { Authorship, Person } from "../lib/records";
import { PageHeader } from "./PageHeader";

/** A record page's second button, in place of Delete, such as Archive. */
export type HeaderAction = { label: string; icon: ReactNode; onClick: () => void; pending?: boolean };

/** A page gives Delete or another button, never both. */
type SecondButton = { onDelete: () => void; action?: never } | { action: HeaderAction; onDelete?: never };

type HeaderProps = SecondButton & { title: string; chips?: ReactNode; onEdit: () => void };

export function RecordHeader({ title, chips, onEdit, onDelete, action }: HeaderProps) {
  const second: HeaderAction = action ?? {
    label: "Delete",
    icon: <Trash2 size={15} aria-hidden="true" />,
    onClick: onDelete!,
  };
  return (
    <PageHeader title={title}>
      {chips}
      <div className="ml-auto flex flex-none gap-2">
        <button type="button" className="btn btn-secondary bg-panel" onClick={onEdit}>
          <Pencil size={15} aria-hidden="true" />
          Edit
        </button>
        <button type="button" className="btn btn-secondary bg-panel" disabled={second.pending} onClick={second.onClick}>
          {second.icon}
          {second.label}
        </button>
      </div>
    </PageHeader>
  );
}

export function RecordColumns({ side, children }: { side: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,380px)_minmax(0,1fr)] items-start gap-3 px-5 pb-4">
      <div className="flex min-w-0 flex-col gap-3">{side}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SidePanel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="panel px-[18px] py-4">
      <div className="flex items-center justify-between gap-3">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="flex-none text-[13px] leading-[18px] font-semibold">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

export function LinkedList({
  items,
  empty,
}: {
  items: { key: number; to: string; name: string; hint?: ReactNode; end?: ReactNode }[];
  empty: string;
}) {
  if (items.length === 0) return <p className="py-1 text-muted">{empty}</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.key} className="flex items-center justify-between gap-3 py-1.5">
          <div className="min-w-0">
            <Link to={item.to} className="link block truncate font-medium">
              {item.name}
            </Link>
            {item.hint && <div className="truncate text-[13px] leading-[18px] text-muted">{item.hint}</div>}
          </div>
          <div className="flex-none">{item.end}</div>
        </li>
      ))}
    </ul>
  );
}

export const NONE = <span className="text-muted">None</span>;

function WhoAndWhen({ action, person, at }: { action: string; person: Person | null; at: string }) {
  return (
    <p>
      {person ? `${action} by ${person.name} on ` : `${action} `}
      <span className="num text-[12px]">{formatDate(at)}</span>
    </p>
  );
}

/**
 * An add sets both times at once. Records from before sign-in may have got them from
 * two readings of the clock, a moment apart, so for those under a second isn't a change.
 */
function hasChanged(record: Authorship) {
  if (record.updated_at === record.created_at) return false;
  const fromBeforeSignIn = record.created_by === null && record.updated_by === null;
  return !fromBeforeSignIn || differenceInSeconds(parseISO(record.updated_at), parseISO(record.created_at)) >= 1;
}

/** Who added the record and who last changed it, for the foot of its details panel. */
export function AddedAndChanged({ record }: { record: Authorship }) {
  const changed = hasChanged(record);
  return (
    <div className="mt-3 flex flex-col gap-0.5 text-[13px] leading-[18px] text-muted">
      <WhoAndWhen action="Added" person={record.created_by} at={record.created_at} />
      {changed && <WhoAndWhen action="Last changed" person={record.updated_by} at={record.updated_at} />}
    </div>
  );
}
