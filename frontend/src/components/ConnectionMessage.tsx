import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { CONNECTION_MESSAGE, api, useConnectionLost } from "../lib/api";

const RETRY_MS = 3000;

export function ConnectionMessage() {
  const lost = useConnectionLost();
  const client = useQueryClient();

  useEffect(() => {
    if (!lost) return;
    const timer = setInterval(() => {
      api("/meta").then(
        () => client.invalidateQueries(),
        () => undefined,
      );
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [lost, client]);

  if (!lost) return null;
  return (
    <div role="alert" className="mx-5 mt-3 rounded-panel bg-chip-alert px-5 py-3 font-semibold text-white">
      {CONNECTION_MESSAGE}
    </div>
  );
}
