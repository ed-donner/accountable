// The six pipeline stages in order (P1), their colors (Concern 2) and usual
// probabilities (D3). The backend applies the rules; these are for showing them.
import type { Schemas } from "./api";

export type Stage = Schemas["DealRow"]["stage"];
export type Status = Schemas["ContactRow"]["status"];

export type StageInfo = {
  key: Stage;
  label: string;
  color: string;
  usualProbability: number;
  open: boolean;
};

export const STAGES: StageInfo[] = [
  {
    key: "new",
    label: "New",
    color: "var(--stage-new)",
    usualProbability: 10,
    open: true,
  },
  {
    key: "qualified",
    label: "Qualified",
    color: "var(--stage-qualified)",
    usualProbability: 25,
    open: true,
  },
  {
    key: "proposal",
    label: "Proposal",
    color: "var(--stage-proposal)",
    usualProbability: 50,
    open: true,
  },
  {
    key: "negotiation",
    label: "Negotiation",
    color: "var(--stage-negotiation)",
    usualProbability: 75,
    open: true,
  },
  {
    key: "won",
    label: "Won",
    color: "var(--stage-won)",
    usualProbability: 100,
    open: false,
  },
  {
    key: "lost",
    label: "Lost",
    color: "var(--stage-lost)",
    usualProbability: 0,
    open: false,
  },
];

export const OPEN_STAGES = STAGES.filter((s) => s.open).map((s) => s.key);

export function stageInfo(stage: Stage): StageInfo {
  return STAGES.find((s) => s.key === stage)!;
}

export function stageLabel(stage: Stage): string {
  return stageInfo(stage).label;
}

export const STATUSES: { key: Status; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "qualified", label: "Qualified" },
  { key: "customer", label: "Customer" },
];

export function statusLabel(status: Status): string {
  return STATUSES.find((s) => s.key === status)!.label;
}
