import { Sparkles } from "lucide-react";
import type { Ref } from "react";

import { PANEL_ID } from "./CopilotPanel";

type Props = {
  open: boolean;
  onToggle: () => void;
  /** So focus can come back to the button as the panel closes. */
  ref?: Ref<HTMLButtonElement>;
};

/**
 * The top bar's Copilot button, which opens and closes the panel (Z1). In the page color while the
 * panel is closed, and Sea Green while it's open, as the current section is.
 */
export function CopilotButton({ open, onToggle, ref }: Props) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Copilot"
      aria-expanded={open}
      aria-controls={open ? PANEL_ID : undefined}
      onClick={onToggle}
      className={`inline-flex size-8 flex-none items-center justify-center rounded-full ${
        open ? "bg-sea-green text-midnight" : "bg-page text-ink"
      }`}
    >
      <Sparkles size={16} aria-hidden="true" />
    </button>
  );
}
