import { plural, shortMoney } from "../shared/format";
import { stageInfo } from "../shared/stages";
import type { Dashboard } from "./hooks";

/** H5: value reaching each stage, as centered bars that narrow. */
export function Funnel({ steps }: { steps: Dashboard["funnel"] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="steps" aria-label="Sales funnel">
      {steps.map((step) => {
        const info = stageInfo(step.stage);
        const width = (100 * step.value) / max;
        return (
          <li className="step" key={step.stage}>
            <span className="name">
              {info.label}
              <span className="muted">{plural(step.count, "deal")}</span>
            </span>
            <div style={{ marginLeft: `${(100 - width) / 2}%`, width: `${width}%` }}>
              <div className="bar" style={{ background: info.color }} />
            </div>
            <span className="pct">
              <b>{shortMoney(step.value)}</b>
              {step.share_of_previous !== null ? `${Math.round(step.share_of_previous * 100)}% of previous` : " "}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
