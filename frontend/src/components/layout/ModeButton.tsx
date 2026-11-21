import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { setMode, useMode } from "@/lib/mode";
import { cn } from "@/lib/utils";

/**
 * Switches between light and dark mode, at the right end of the top bar
 * (GEN-9, spec 2.5): a moon in light mode and a sun in dark mode, named for
 * what it does.
 */
export function ModeButton({ className }: { className?: string }) {
  const mode = useMode();
  const next = mode === "dark" ? "light" : "dark";
  const label = `Switch to ${next} mode`;
  const Icon = mode === "dark" ? Sun : Moon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="icon"
          size="icon"
          aria-label={label}
          onClick={() => setMode(next)}
          // In the band, so it takes the band's colors like the section links.
          className={cn("size-9 rounded-full text-band-ink-soft hover:bg-band-rest hover:text-band-ink", className)}
        >
          <Icon className="size-[18px]" aria-hidden data-mode-icon={mode === "dark" ? "sun" : "moon"} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
