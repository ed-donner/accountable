import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

// Labels sit above their fields: 12/16, medium (spec 2.6).
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("flex items-center gap-1 text-[12px] leading-4 font-medium text-ink-muted select-none", className)}
      {...props}
    />
  );
}

export { Label };
