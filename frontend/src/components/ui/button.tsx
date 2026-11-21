import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

// The brand's buttons (spec 2.6): main, second, delete and icon, plus a quiet
// button for the Midnight band.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-[14px] font-semibold whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        main: "bg-sea-green text-midnight hover:bg-sea-green-hover",
        second: "border border-control-border bg-panel text-ink hover:bg-accent",
        delete: "bg-destructive text-white hover:bg-destructive-hover",
        icon: "text-ink-muted hover:bg-accent hover:text-ink",
        band: "bg-band-button font-medium text-band-ink-soft hover:bg-band-button-hover hover:text-band-ink",
        link: "h-auto px-0 font-medium text-cerulean-text hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[13px]",
        icon: "size-8",
      },
    },
    defaultVariants: {
      variant: "main",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "main",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
