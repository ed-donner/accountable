/**
 * Under a select whose choices didn't load: says so and offers to try again,
 * leaving the rest of the form as typed.
 */
export function ListRetry({ what, onRetry, retrying }: { what: string; onRetry: () => void; retrying: boolean }) {
  return (
    <span className="error list-retry" role="alert">
      Couldn't load the {what}.{" "}
      <button type="button" className="btn ghost small" onClick={onRetry} disabled={retrying}>
        {retrying ? "Trying again…" : "Retry"}
      </button>
    </span>
  );
}
