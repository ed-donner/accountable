import type { Stage } from "../queries";

export const STAGE_COLORS: Record<Stage, { fill: string; ink: string }> = {
  new: { fill: "var(--color-sea-green)", ink: "var(--color-midnight)" },
  qualified: { fill: "var(--color-marigold)", ink: "var(--color-midnight)" },
  proposal: { fill: "var(--color-coral)", ink: "var(--color-midnight)" },
  negotiation: { fill: "var(--color-cerulean)", ink: "var(--color-white)" },
  won: { fill: "var(--color-ink)", ink: "var(--color-on-won)" },
  lost: { fill: "var(--color-raspberry)", ink: "var(--color-white)" },
};
