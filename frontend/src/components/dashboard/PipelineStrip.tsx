import type { Dashboard } from "@/api/types";
import { StageDot } from "@/components/Badges";
import { money, pluralNoun } from "@/lib/format";
import { STAGE_NAMES, STAGE_TONE, TONE_COLOR } from "@/lib/rules";

/**
 * Open pipeline by stage, as one strip across the band (DASH-6). Each open
 * stage is a segment as wide as its total value, and the colored part of it is
 * its expected revenue. Every segment carries its stage name, so color never
 * names a stage on its own (spec 2.6).
 */
export function PipelineStrip({ stages }: { stages: Dashboard["open_by_stage"] }) {
  return (
    <section aria-labelledby="strip-title">
      <div className="mb-3.5 flex items-baseline justify-between gap-6">
        <h2 id="strip-title" className="text-[16px] leading-6 font-semibold text-band-ink">
          Open pipeline by stage
        </h2>
        <div className="flex gap-4 text-[12px] text-band-muted" aria-hidden>
          <span>Colored part: expected revenue</span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-3 rounded-[3px] bg-band-rest" />
            Rest of the value
          </span>
        </div>
      </div>
      <ul className="flex gap-1.5" aria-label="Open pipeline by stage">
        {stages.map((stage) => {
          const share = stage.value > 0 ? (stage.expected / stage.value) * 100 : 0;
          return (
            <li
              key={stage.stage}
              className="min-w-[132px]"
              style={{ flex: `${Math.max(stage.value, 1)} 1 0` }}
              data-stage={stage.stage}
            >
              <div className="h-10 overflow-hidden rounded-lg bg-band-rest" aria-hidden>
                <div
                  className="h-full shadow-[2px_0_0_var(--band)]"
                  style={{ width: `${share}%`, background: TONE_COLOR[STAGE_TONE[stage.stage]] }}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 font-semibold text-band-ink">
                <StageDot stage={stage.stage} />
                {STAGE_NAMES[stage.stage]}
                <span className="font-mono text-[12px] font-normal text-band-muted">
                  {stage.count}
                  <span className="sr-only"> {pluralNoun(stage.count, "deal")}</span>
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[16px] text-band-ink tabular" data-figure="value">
                {money(stage.value)}
              </div>
              <div className="text-[12px] text-band-muted">
                Expected{" "}
                <span className="font-mono tabular" data-figure="expected">
                  {money(stage.expected)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
