import { ApiError, GENERAL_MESSAGE } from "./api";
import { NotFound } from "./NotFound";

export function Loading() {
  return (
    <div className="loading muted" aria-busy="true">
      Loading…
    </div>
  );
}

/** What a page shows when its data didn't load. */
export function LoadError({ error, what }: { error: unknown; what: string }) {
  if (error instanceof ApiError && error.status === 404) return <NotFound what={what} />;
  return (
    <div className="panel empty-state" role="alert">
      <p>
        Couldn't load this {what}. {error instanceof ApiError ? error.message : GENERAL_MESSAGE}
      </p>
    </div>
  );
}
