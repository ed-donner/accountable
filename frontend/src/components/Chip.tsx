import type { ReactNode } from "react";

const TONES = {
  seaGreen: "bg-sea-green text-ink",
  marigold: "bg-marigold text-ink",
  coral: "bg-coral text-ink",
  info: "bg-chip-info text-white",
  midnight: "bg-ink text-sea-mist",
  alert: "bg-chip-alert text-white",
  quiet: "bg-page text-muted",
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
