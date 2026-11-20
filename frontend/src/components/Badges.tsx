import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_NAMES, STAGE_TONE, STATUS_NAMES, STATUS_TONE, TONE_COLOR, type Stage, type Status, type Tone } from "@/lib/rules";

// Badges are pills: the tint behind, the text shade for the words, 12px medium (spec 2.6).
const TONE_CLASSES: Record<Tone, string> = {
  slate: "bg-slate-tint text-slate-text",
  marigold: "bg-marigold-tint text-marigold-text",
  coral: "bg-coral-tint text-coral-text",
  cerulean: "bg-cerulean-tint text-cerulean-text",
  "sea-green": "bg-sea-green-tint text-sea-green-text",
  raspberry: "bg-raspberry-tint text-raspberry-text",
};

function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] leading-4 font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <Pill tone={STAGE_TONE[stage]} className={className}>
      {STAGE_NAMES[stage]}
    </Pill>
  );
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <Pill tone={STATUS_TONE[status]} className={className}>
      {STATUS_NAMES[status]}
    </Pill>
  );
}

/** Late stands out more than the rest: filled in, with a clock (spec 2.6). */
export function LateBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-raspberry-text py-0.5 pr-2 pl-1.5 text-[11px] leading-4 font-semibold whitespace-nowrap text-white",
        className,
      )}
    >
      <Clock className="size-3" aria-hidden />
      Late
    </span>
  );
}

/** A stage-colored dot, always beside the stage's name (spec 2.6, charts). */
export function StageDot({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ background: TONE_COLOR[STAGE_TONE[stage]] }}
    />
  );
}
