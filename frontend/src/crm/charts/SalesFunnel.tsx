import { useEffect, useRef, useState } from "react";
import { Funnel, FunnelChart, Tooltip } from "recharts";

import { money } from "../../lib/money";
import { STAGE_NAMES } from "../deals";
import type { Dashboard, Stage } from "../queries";
import { ChartTooltip } from "./ChartTooltip";
import { STAGE_COLORS } from "./stageColors";

const SIDE = 196; // Room to the right for the values and percentages.
const ROUND = 6; // Rounded corners come from a stroke this wide with rounded joins.
const GAP = 2;
const NARROWEST = 100; // Keeps a small stage wide enough for its name.
const SPOUT = 0.68; // The last stage tapers this much further, to end neatly.
const PILL = { width: 52, height: 22 };

type FunnelStage = Dashboard["funnel"][number];
type Row = FunnelStage & { name: string };

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

type SegmentProps = {
  index: number;
  stages: FunnelStage[];
  width: number;
  height: number;
};

/** Each stage's top edge is as wide as the value that reached it. */
function Segment({ index, stages, width, height }: SegmentProps) {
  const funnelWidth = width - SIDE;
  const middle = funnelWidth / 2;
  const count = stages.length;
  const pad = ROUND / 2;
  const row = (height - ROUND + GAP) / count;
  const body = row - ROUND - GAP;
  const widest = Math.max(stages[0].value, 1);

  const widths = stages.map((stage) => Math.max((stage.value / widest) * (funnelWidth - ROUND), NARROWEST));
  widths.push(widths[count - 1] * SPOUT);

  const stage = stages[index];
  const top = pad + index * row;
  const bottom = top + body;
  const upper = widths[index] / 2;
  const lower = upper + (widths[index + 1] / 2 - upper) * (body / row);
  const centerY = (top + bottom) / 2;
  const edge = middle + (upper + lower) / 2 + pad;
  const join = top - (ROUND + GAP) / 2;
  const { fill, ink } = STAGE_COLORS[stage.stage];

  return (
    <g>
      <path
        d={`M${middle - upper} ${top} L${middle + upper} ${top} L${middle + lower} ${bottom} L${middle - lower} ${bottom} Z`}
        fill={fill}
        stroke={fill}
        strokeWidth={ROUND}
        strokeLinejoin="round"
      />
      <text x={middle} y={centerY + 5} textAnchor="middle" style={{ fill: ink, font: "600 14px var(--font-sans)" }}>
        {STAGE_NAMES[stage.stage]}
      </text>
      <line
        x1={edge + 4}
        x2={funnelWidth + 10}
        y1={centerY}
        y2={centerY}
        stroke="var(--color-sea-mist)"
        strokeDasharray="2 4"
      />
      <text
        x={funnelWidth + 16}
        y={centerY + 5}
        style={{ fill: "var(--color-ink)", font: "500 14px var(--font-mono)" }}
      >
        {money(stage.value)}
      </text>
      {stage.carried !== null && (
        <>
          <rect
            x={width - PILL.width}
            y={join - PILL.height / 2}
            width={PILL.width}
            height={PILL.height}
            rx={PILL.height / 2}
            fill="var(--color-page)"
          />
          <text
            x={width - PILL.width / 2}
            y={join + 4}
            textAnchor="middle"
            style={{ fill: "var(--color-ink)", font: "500 12px var(--font-mono)" }}
          >
            {stage.carried}%
          </text>
        </>
      )}
    </g>
  );
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return <ChartTooltip value={money(row.value)} label={`reached ${STAGE_NAMES[row.stage as Stage]}`} />;
}

export function SalesFunnel({ stages }: { stages: Dashboard["funnel"] }) {
  const { ref, size } = useSize();
  const rows: Row[] = stages.map((stage) => ({ ...stage, name: STAGE_NAMES[stage.stage] }));
  const shown = size.width > SIDE && size.height > 0;
  const summary = stages.map((stage) => `${STAGE_NAMES[stage.stage]} ${money(stage.value)}`).join(", ");

  return (
    <div ref={ref} role="img" aria-label={`Sales funnel, value reaching each stage: ${summary}`} className="mt-2 min-h-0 flex-1">
      {shown && (
        <FunnelChart width={size.width} height={size.height} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Tooltip content={<Tip />} />
          <Funnel
            data={rows}
            dataKey="value"
            nameKey="name"
            isAnimationActive={false}
            shape={({ payload }: { payload?: Row }) => (
              <Segment
                index={stages.findIndex((stage) => stage.stage === payload?.stage)}
                stages={stages}
                width={size.width}
                height={size.height}
              />
            )}
          />
        </FunnelChart>
      )}
    </div>
  );
}
