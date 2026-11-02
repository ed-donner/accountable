import { Chip, type ChipTone } from "../components/Chip";
import { capitalize } from "../lib/words";
import { STAGE_NAMES } from "./deals";
import type { Stage, Status } from "./queries";

const STAGE_TONES: Record<Stage, ChipTone> = {
  new: "seaGreen",
  qualified: "marigold",
  proposal: "coral",
  negotiation: "info",
  won: "won",
  lost: "alert",
};

const STATUS_TONES: Record<Status, ChipTone> = {
  customer: "seaGreen",
  qualified: "marigold",
  lead: "coral",
};

export function StageChip({ stage }: { stage: Stage }) {
  return <Chip tone={STAGE_TONES[stage]}>{STAGE_NAMES[stage]}</Chip>;
}

export function StatusChip({ status }: { status: Status }) {
  return <Chip tone={STATUS_TONES[status]}>{capitalize(status)}</Chip>;
}
