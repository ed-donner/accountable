import { ApiError } from "../lib/api";
import { EmptyState } from "./EmptyState";

type Props = {
  error: unknown;
  onRetry: () => void;
  /** Directly on the page, not inside a panel. The button needs a panel to stand out from. */
  onPage?: boolean;
  /** What's on screen came from an earlier read, and stays there. */
  keeping?: boolean;
};

/**
 * A read that failed, with a way to try again. A lost connection has its own
 * message across the top, which tries again by itself.
 */
export function LoadFailed({ error, onRetry, onPage, keeping }: Props) {
  if (!error || (error instanceof ApiError && error.kind === "connection")) return null;

  const tryAgain = (
    <button type="button" className="btn btn-secondary" onClick={onRetry}>
      Try again
    </button>
  );

  if (keeping) {
    return (
      <div
        role="alert"
        className={`flex flex-none items-center justify-between gap-3 ${onPage ? "panel mx-5 mb-2.5 py-2 pr-2 pl-4" : "py-1.5 pl-2.5"}`}
      >
        <p>Couldn't refresh this, so it may be out of date.</p>
        {tryAgain}
      </div>
    );
  }

  return (
    <div role="alert" className={onPage ? "panel mx-5 mt-3" : undefined}>
      <EmptyState message="Couldn't load this.">{tryAgain}</EmptyState>
    </div>
  );
}
