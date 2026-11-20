import { toast } from "sonner";
import { useChangeStage } from "@/api/deals";
import type { Deal } from "@/api/types";
import { OPEN_STAGES, STAGE_NAMES, STAGE_TONE, TONE_COLOR, type Stage } from "@/lib/rules";
import { messages } from "@/lib/words";
import { cn } from "@/lib/utils";

// The current stage in its full color. Sea Green, Marigold, Coral and the slate
// take Midnight text; Cerulean and Raspberry use their darker shade with white
// text, so the words stay readable (spec, concern 3).
const CURRENT: Record<Stage, string> = {
  new: "bg-slate text-midnight",
  qualified: "bg-marigold text-midnight",
  proposal: "bg-coral text-midnight",
  negotiation: "bg-cerulean-text text-white",
  won: "bg-sea-green text-midnight",
  lost: "bg-raspberry-text text-white",
};

/** The six stages with the current one marked; clicking another moves the deal (DEAL-5). */
export function StageBar({ deal }: { deal: Deal }) {
  const changeStage = useChangeStage();
  const currentIndex = OPEN_STAGES.indexOf(deal.stage);

  function move(stage: Stage) {
    if (stage === deal.stage || changeStage.isPending) return;
    changeStage.mutate(
      { id: deal.id, stage },
      {
        onSuccess: () => toast.success(messages.moved(stage)),
        onError: () => toast.error(messages.moveFailed),
      },
    );
  }

  function step(stage: Stage, index: number, shape: string) {
    const current = stage === deal.stage;
    // Past stages are filled in with a tint of their color.
    const past =
      deal.stage === "won" || deal.stage === "lost" ? stage !== "lost" && stage !== "won" : index < currentIndex;
    return (
      <button
        key={stage}
        type="button"
        onClick={() => move(stage)}
        aria-current={current ? "step" : undefined}
        aria-label={current ? `${STAGE_NAMES[stage]}, the current stage` : `Move to ${STAGE_NAMES[stage]}`}
        disabled={changeStage.isPending}
        className={cn(
          "flex h-10 min-w-0 flex-1 items-center justify-center gap-2 px-3 text-[14px] font-semibold transition-colors duration-150 disabled:cursor-wait",
          shape,
          current
            ? CURRENT[stage]
            : past
              ? "text-band-ink hover:brightness-110"
              : "bg-band-panel text-band-muted hover:bg-band-rest hover:text-band-ink",
        )}
        style={
          !current && past
            ? { background: `color-mix(in srgb, ${TONE_COLOR[STAGE_TONE[stage]]} 28%, #073B4C)` }
            : undefined
        }
      >
        {!current && (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: TONE_COLOR[STAGE_TONE[stage]] }}
          />
        )}
        {STAGE_NAMES[stage]}
      </button>
    );
  }

  return (
    <nav aria-label="Stage" className="mt-6 flex items-center gap-3">
      <div className="flex flex-[4] gap-0.5">
        {OPEN_STAGES.map((stage, index) =>
          step(stage, index, index === 0 ? "rounded-l-lg" : index === OPEN_STAGES.length - 1 ? "rounded-r-lg" : ""),
        )}
      </div>
      <div className="flex flex-[2] gap-3">
        {step("won", 4, "rounded-lg")}
        {step("lost", 5, "rounded-lg")}
      </div>
    </nav>
  );
}
