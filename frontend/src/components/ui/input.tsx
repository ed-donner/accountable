import * as React from "react";
import { cn } from "@/lib/utils";

// A full --control-border border (3.2:1 on white), 8px corners (spec 2.6).
const fieldClasses =
  "w-full min-w-0 rounded-lg border border-control-border bg-panel px-3 text-[14px] text-ink transition-colors duration-150 placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:bg-page disabled:text-ink-muted aria-invalid:border-raspberry-text";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldClasses, "h-10", className)} {...props} />;
}

export { Input, fieldClasses };
