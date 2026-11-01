import { Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { PageHeader } from "../components/PageHeader";

type HeaderProps = { title: string; chips?: ReactNode; onEdit: () => void; onDelete: () => void };

export function RecordHeader({ title, chips, onEdit, onDelete }: HeaderProps) {
  return (
    <PageHeader title={title}>
      {chips}
      <div className="ml-auto flex flex-none gap-2">
        <button type="button" className="btn btn-secondary bg-panel" onClick={onEdit}>
          <Pencil size={15} aria-hidden="true" />
          Edit
        </button>
        <button type="button" className="btn btn-secondary bg-panel" onClick={onDelete}>
          <Trash2 size={15} aria-hidden="true" />
          Delete
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

export function LinkedList({ items, empty }: { items: { key: number; to: string; name: string; hint?: ReactNode; end?: ReactNode }[]; empty: string }) {
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
