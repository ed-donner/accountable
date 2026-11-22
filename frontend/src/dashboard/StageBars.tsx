import { Link } from "react-router-dom";
import { money } from "../shared/format";
import { stageInfo } from "../shared/stages";
import type { Dashboard } from "./hooks";

/** H4: each open stage's value, with its expected revenue inside, linking to the board. */
export function StageBars({ stages }: { stages: Dashboard["pipeline"] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="stagebars">
      {stages.map((s) => {
        const info = stageInfo(s.stage);
        return (
          <Link className="s-row" to="/pipeline" key={s.stage} aria-label={`${info.label}: ${s.count} deals, ${money(s.value)}, expected ${money(s.expected_revenue)}`}>
            <span className="s-name">
              <span className="dot" style={{ background: info.color }} aria-hidden="true" />
              {info.label}
              <span className="muted">{s.count}</span>
            </span>
            <span className="s-track">
              <span className="s-bar" style={{ width: `${(100 * s.value) / max}%`, background: info.color, display: "block" }}>
                <span className="s-total" />
                <span className="s-exp" style={{ width: s.value ? `${(100 * s.expected_revenue) / s.value}%` : 0, background: info.color }} />
              </span>
            </span>
            <span className="s-val">
              {money(s.value)}
              <span className="muted"> / {money(s.expected_revenue)}</span>
            </span>
          </Link>
        );
      })}
      <div className="s-key">
        <span><i className="k-total" />Total value</span>
        <span><i />Expected revenue</span>
      </div>
    </div>
  );
}
