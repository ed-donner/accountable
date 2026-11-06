import { useCallback, useRef, useState } from "react";

import { useConversation } from "./conversation";
import { CopilotButton } from "./CopilotButton";
import { CopilotPanel } from "./CopilotPanel";

/**
 * The Copilot in the top bar: its button, and its panel beside the page while open (Z1). The
 * conversation lives here rather than in the panel, so closing the panel keeps it (Z2). App.tsx makes
 * this again for each session, so sign-out drops the conversation and anything it was doing (U5).
 */
export function Copilot() {
  const conversation = useConversation();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  // Stable, because the panel listens for Escape with it.
  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);

  return (
    <>
      <CopilotButton ref={button} open={open} onToggle={() => setOpen((wasOpen) => !wasOpen)} />
      {open && <CopilotPanel conversation={conversation} onClose={close} />}
    </>
  );
}
