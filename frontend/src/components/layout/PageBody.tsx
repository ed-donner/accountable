import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The light content area: 32px padding, up to 1440px wide and centered. */
export function PageBody({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <main className={cn("px-8 pt-7 pb-10", className)}>
      <div className={cn("mx-auto w-full", !wide && "max-w-[1440px]")}>{children}</div>
    </main>
  );
}
