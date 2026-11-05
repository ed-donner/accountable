import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";

// What every area's records share. A record's kind is where its API starts, such
// as "deals", and its own queries are keyed by its kind and id, such as ["deals", 7].

/** A teammate, with the name already falling back to their email (U8). */
export type Person = { id: string; name: string };

/** Who added a record and who last changed it, and when. Nobody is recorded on records from before sign-in (U12). */
export type Authorship = {
  created_at: string;
  created_by: Person | null;
  updated_at: string;
  updated_by: Person | null;
};

/** A save, after which everything is read again. */
export function useWrite<Input, Result>(write: (input: Input) => Promise<Result>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: write, onSuccess: () => client.invalidateQueries() });
}

export function useDeleteImpact<T>(kind: string, id: number) {
  return useQuery({
    queryKey: [kind, id, "impact"],
    queryFn: () => api<T>(`/${kind}/${id}/delete-impact`),
    gcTime: 0,
  });
}

/**
 * Leaves the deleted record's own queries alone, so a page that's about to close
 * doesn't refetch it and log a 404.
 */
export function useDeleteRecord(kind: string, id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/${kind}/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      client.invalidateQueries({
        predicate: (query) => !(query.queryKey[0] === kind && query.queryKey[1] === id),
      }),
  });
}
