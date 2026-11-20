import { Fragment } from "react";
import type { Dashboard } from "@/api/types";
import { Panel, PanelTitle } from "@/components/states";
import { funnelShares } from "@/lib/dashboard";
import { money, plural } from "@/lib/format";
import { STAGE_NAMES } from "@/lib/rules";

// One measure, so one color, with Won in Sea Green because it means success (spec 2.6).
const STEP = "#0D6E8E";
const WON = "#06D6A0";

/**
 * The sales funnel (DASH-5): how much value reached each stage, as bars from
 * the left, with the share carried from each step to the next. HTML bars, so
 * they line up with the text around them (plan, decision 13).
 */
export function Funnel({ steps }: { steps: Dashboard["funnel"] }) {
  const max = Math.max(...steps.map((step) => step.value), 1);
  const shares = funnelShares(steps);

  return (
    <Panel aria-labelledby="funnel-title">
      <PanelTitle hint="Created in the last 12 months" id="funnel-title">
        Sales funnel
      </PanelTitle>
      <ol aria-label="Sales funnel">
        {steps.map((step, i) => (
          <Fragment key={step.stage}>
            {i > 0 && shares[i - 1] !== null && (
              <li aria-hidden className="ml-[112px] text-[12px] leading-[14px] text-ink-subtle">
                {shares[i - 1]}% carried on
              </li>
            )}
            <li className="grid h-[46px] grid-cols-[100px_1fr_96px] items-center gap-3" data-stage={step.stage}>
              <span className="font-medium text-ink">{STAGE_NAMES[step.stage]}</span>
              <span className="h-[22px]" aria-hidden>
                <span
                  className="block h-full rounded-r-md"
                  style={{ width: `${(step.value / max) * 100}%`, background: step.stage === "won" ? WON : STEP }}
                />
              </span>
              <span className="flex flex-col items-end text-[13px]">
                <span className="font-mono text-ink tabular" data-figure="value">
                  {money(step.value)}
                </span>
                <span className="text-[12px] text-ink-subtle" data-figure="count">
                  {plural(step.count, "deal")}
                </span>
              </span>
            </li>
          </Fragment>
        ))}
      </ol>
      <p className="sr-only">
        {steps
          .slice(1)
          .map((step, i) => (shares[i] === null ? null : `${shares[i]}% carried on from ${STAGE_NAMES[steps[i].stage]} to ${STAGE_NAMES[step.stage]}.`))
          .filter(Boolean)
          .join(" ")}
      </p>
    </Panel>
  );
}
