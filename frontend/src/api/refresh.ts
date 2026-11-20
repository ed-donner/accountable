import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * After any change succeeds, refresh every query (plan, decision 11). TanStack
 * Query refetches what's on screen and marks the rest stale.
 *
 * After a delete, the deleted record's own queries are left as they are. The
 * page showing the record is still on screen until it navigates away, and
 * refreshing (or removing) its query would ask for the record again and get a
 * 404, which leaves an error in the console (GEN-7). Once that page is gone the
 * query expires; visiting the address again fetches it afresh and shows that
 * the record no longer exists.
 */
export function refreshAll(queryClient: QueryClient, gone: QueryKey[] = []): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => !gone.some((key) => key.every((part, i) => query.queryKey[i] === part)),
  });
}
