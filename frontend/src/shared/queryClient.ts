import { QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Every screen shows fresh figures when it opens (H8); data is small and local.
      queries: { staleTime: 0, retry: 1, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}

/** After any change, refetch whatever is on screen, so every figure stays in step. */
export function useRefreshAll(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}

/** Create (no id) or update (with id) a record, then refresh everything on screen. */
export function useSaveRecord<T>(path: string) {
  const refreshAll = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: unknown }) =>
      id === undefined ? api<T>(path, "POST", body) : api<T>(`${path}/${id}`, "PATCH", body),
    onSuccess: () => refreshAll(),
  });
}
