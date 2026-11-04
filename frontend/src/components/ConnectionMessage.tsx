import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { CONNECTION_MESSAGE, api, onReconnect, useConnectionLost } from "../lib/api";

const RETRY_MS = 3000;

export function ConnectionMessage() {
  const lost = useConnectionLost();
  const client = useQueryClient();

  // Any good reply can clear this message, not only the check below, and a screen
  // that lost its read to the connection shows nothing of its own.
  useEffect(() => onReconnect(() => client.invalidateQueries()), [client]);

  useEffect(() => {
    if (!lost) return;
    const timer = setInterval(() => {
      api("/meta").catch(() => undefined);
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [lost]);

  if (!lost) return null;
  return (
    <div role="alert" className="mx-5 mt-3 rounded-panel bg-chip-alert px-5 py-3 font-semibold text-white">
      {CONNECTION_MESSAGE}
    </div>
  );
}
