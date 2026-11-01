import type { Stage } from "../queries";

export const STAGE_COLORS: Record<Stage, { fill: string; ink: string }> = {
  new: { fill: "var(--color-sea-green)", ink: "var(--color-ink)" },
  qualified: { fill: "var(--color-marigold)", ink: "var(--color-ink)" },
  proposal: { fill: "var(--color-coral)", ink: "var(--color-ink)" },
  negotiation: { fill: "var(--color-cerulean)", ink: "#ffffff" },
  won: { fill: "var(--color-ink)", ink: "var(--color-sea-mist)" },
  lost: { fill: "var(--color-raspberry)", ink: "#ffffff" },
};
