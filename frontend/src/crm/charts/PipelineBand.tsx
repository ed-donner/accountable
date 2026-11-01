import { Link } from "react-router";

import { money } from "../../lib/money";
import { plural } from "../../lib/words";
import { STAGE_NAMES } from "../deals";
import type { Dashboard } from "../queries";
import { STAGE_COLORS } from "./stageColors";

export function PipelineBand({ stages }: { stages: Dashboard["band"] }) {
  const anyValue = stages.some((stage) => stage.value > 0);
  return (
    <Link to="/pipeline" aria-label="Open the pipeline" className="flex h-[76px] min-w-0 gap-0.5" data-testid="pipeline-band">
      {stages.map((stage) => {
        const { fill, ink } = STAGE_COLORS[stage.stage];
        return (
          <div
            key={stage.stage}
            data-testid={`band-${stage.stage}`}
            style={{ flex: `${anyValue ? stage.value : 1} 1 0`, background: fill, color: ink }}
            className="min-w-[104px] rounded-sm px-2.5 py-2 first:rounded-l-[10px] last:rounded-r-[10px]"
          >
            <div className="text-[14px] leading-[18px] font-semibold">{STAGE_NAMES[stage.stage]}</div>
            <div className="num text-[15px] leading-5 font-medium">{money(stage.value)}</div>
            <div className="text-[13px] leading-[18px] font-medium">{plural(stage.count, "deal")}</div>
          </div>
        );
      })}
    </Link>
  );
}
