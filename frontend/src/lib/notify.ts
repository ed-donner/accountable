import { useState } from "react";
import { toast, type ExternalToast } from "sonner";

import { currentSession } from "./session";

type Show = (message: string, options?: ExternalToast) => void;

/** Shows a message at the bottom of the page, if the session it belongs to is still going. */
export type Notify = { success: Show; error: Show };

/**
 * Messages for the session the component began in, and never for a later one (U5).
 * Sonner keeps its messages for the whole page, so a save whose reply comes after
 * sign-out would otherwise show its message, and any button on it, to whoever signs
 * in next. The messages still showing when a session ends go with it: see dropMessages.
 */
export function useNotify(): Notify {
  const [notify] = useState(() => {
    const begunIn = currentSession();
    const whileGoing =
      (show: (...message: Parameters<Show>) => unknown): Show =>
      (...message) => {
        if (currentSession() === begunIn) show(...message);
      };
    return { success: whileGoing(toast.success), error: whileGoing(toast.error) };
  });
  return notify;
}

/**
 * Takes away every message still showing, and the buttons on them, when a session ends.
 * Sonner would hand them to the next session's Toaster when it starts.
 */
export function dropMessages() {
  toast.dismiss();
}
