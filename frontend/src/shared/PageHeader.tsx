import type { ReactNode } from "react";

type Props = { title: string; summary?: ReactNode; action?: ReactNode };

export function PageHeader({ title, summary, action }: Props) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {summary !== undefined && <div className="muted">{summary}</div>}
      </div>
      {action && <div className="page-action">{action}</div>}
    </header>
  );
}
