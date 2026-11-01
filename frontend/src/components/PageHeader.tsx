import type { ReactNode } from "react";

type Props = { title: string; baseline?: boolean; children?: ReactNode };

export function PageHeader({ title, baseline, children }: Props) {
  return (
    <div className={`flex flex-none gap-[18px] px-6 pt-3 pb-2.5 ${baseline ? "items-baseline" : "items-center"}`}>
      <title>{`${title} | Accountable`}</title>
      <h1 className="min-w-0 truncate">{title}</h1>
      {children}
    </div>
  );
}
