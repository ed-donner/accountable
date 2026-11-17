import { stageInfo, type Stage } from "../shared/stages";

export function StagePill({ stage }: { stage: Stage }) {
  const info = stageInfo(stage);
  return (
    <span className="stage-pill">
      <span className="dot" style={{ background: info.color }} aria-hidden="true" />
      {info.label}
    </span>
  );
}
