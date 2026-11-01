import { useLayoutEffect, useRef } from "react";
import { useSearchParams } from "react-router";

export type AddressChange = (next: URLSearchParams) => void;

/**
 * The address's settings, with changes that build on each other.
 *
 * setSearchParams starts from the last render, so a change made before the page
 * has redrawn would undo the one before it. This keeps the newest address to
 * start from instead, and the address itself still has the last word.
 */
export function useAddress() {
  const [params, setParams] = useSearchParams();
  const latest = useRef(params);
  const sent = useRef(new Set<string>());

  useLayoutEffect(() => {
    const text = params.toString();
    if (sent.current.has(text)) {
      // One of ours has landed, perhaps an older one, so the newest stays as it is.
      if (text === latest.current.toString()) sent.current.clear();
      return;
    }
    // Back, forward or a link.
    sent.current.clear();
    latest.current = params;
  }, [params]);

  function update(change: AddressChange) {
    const next = new URLSearchParams(latest.current);
    change(next);
    latest.current = next;
    sent.current.add(next.toString());
    setParams(next, { replace: true });
  }

  return { params, latest, update };
}
