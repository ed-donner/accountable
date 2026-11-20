import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";
import { Band } from "@/components/layout/Band";
import { PageBody } from "@/components/layout/PageBody";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A grey placeholder block, the size of the content it stands in for (spec 2.10). */
export function Placeholder({ className }: { className?: string }) {
  return <Skeleton aria-hidden className={cn("rounded-lg bg-[#E4ECEE]", className)} />;
}

/** A placeholder block on the Midnight band. */
export function BandPlaceholder({ className }: { className?: string }) {
  return <Skeleton aria-hidden className={cn("rounded-lg bg-band-panel", className)} />;
}

/** A white panel: 16px corners, a soft shadow and no outline (spec 2.6). */
export function Panel({ children, className, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cn("rounded-2xl bg-panel p-6 shadow-soft", className)} {...rest}>
      {children}
    </section>
  );
}

export function PanelTitle({
  children,
  hint,
  className,
  id,
}: {
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-baseline justify-between gap-4", className)}>
      <h2 id={id} className="text-[16px] leading-6 font-semibold text-ink">
        {children}
      </h2>
      {hint && <span className="text-[13px] text-ink-subtle">{hint}</span>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {children}
    </div>
  );
}

/** "Page not found", with a link to the dashboard. */
export function NotFound() {
  return (
    <>
      <title>Page not found · Accountable</title>
      <Band title="Page not found" subtitle="There's no page at this address." />
      <PageBody>
        <Panel>
          <Link to="/" className="font-medium text-cerulean-text hover:underline">
            Go to the dashboard
          </Link>
        </Panel>
      </PageBody>
    </>
  );
}

/** A deleted record's address: "This deal no longer exists.", with a link to the table. */
export function Gone({ kind, to, section }: { kind: string; to: string; section: string }) {
  return (
    <>
      <title>{`Not found · Accountable`}</title>
      <Band title={`This ${kind} no longer exists.`} subtitle="It may have been deleted." />
      <PageBody>
        <Panel>
          <Link to={to} className="font-medium text-cerulean-text hover:underline">
            Go to {section}
          </Link>
        </Panel>
      </PageBody>
    </>
  );
}

/** A record page that couldn't load for another reason. */
export function LoadFailed({ message }: { message: string }) {
  return (
    <PageBody>
      <Panel>
        <p className="text-ink">Couldn't load this page. {message}</p>
      </Panel>
    </PageBody>
  );
}
