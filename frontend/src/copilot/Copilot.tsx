import { useCallback, useRef, useState } from "react";

import type { CopilotPanelState } from "../components/Shell";
import { useConversation } from "./conversation";
import { CopilotButton } from "./CopilotButton";
import { CopilotPanel } from "./CopilotPanel";

/**
 * The Copilot in the top bar: its button, and its panel beside the page while open (Z1). The shell keeps
 * whether it's open, because the page makes room for it. The conversation lives here rather than in the
 * panel, so closing the panel keeps it (Z2). App.tsx makes this again for each session, so sign-out drops
 * the conversation and anything it was doing (U5).
 */
export function Copilot({ open, onOpenChange }: CopilotPanelState) {
  const conversation = useConversation();
  // A closed panel stays in the page while it slides out. Each opening is a new panel, so one opened again
  // while it slides out starts afresh, with nothing typed, as any opening does.
  const [leaving, setLeaving] = useState(false);
  const [openings, setOpenings] = useState(0);
  const button = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open) setOpenings((count) => count + 1);
    setLeaving(open);
    onOpenChange(!open);
  }

  // Stable, because the panel listens for Escape with it.
  const close = useCallback(() => {
    setLeaving(true);
    onOpenChange(false);
    button.current?.focus();
  }, [onOpenChange]);

  const gone = useCallback(() => setLeaving(false), []);

  return (
    <>
      <CopilotButton ref={button} open={open} onToggle={toggle} />
      {(open || leaving) && (
        <CopilotPanel key={openings} conversation={conversation} leaving={!open} onClose={close} onGone={gone} />
      )}
    </>
  );
}
