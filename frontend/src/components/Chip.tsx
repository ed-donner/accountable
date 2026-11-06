import type { ReactNode } from "react";

const TONES = {
  seaGreen: "bg-sea-green text-midnight",
  marigold: "bg-marigold text-midnight",
  coral: "bg-coral text-midnight",
  info: "bg-chip-info text-white",
  won: "bg-ink text-on-won",
  alert: "bg-chip-alert text-white",
  // A hovered table row takes the page color, so there the chip takes the panel's, keeping its shape.
  quiet: "bg-page text-muted in-[tr:hover]:bg-panel",
  // The quiet chip where it sits on the page rather than a panel, such as beside a quote's number.
  quietOnPage: "bg-panel text-muted",
  archived: "bg-archived text-ink",
};

export type ChipTone = keyof typeof TONES;

export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-[22px] items-center rounded-full px-2.5 text-[13px] leading-[18px] font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
