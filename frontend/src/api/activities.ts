import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { refreshAll } from "./refresh";
import type { ActivityInput, TimelineEntry } from "./types";

export type ActivityTarget = { contact_id: number } | { deal_id: number };

export function useLogActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ target, input }: { target: ActivityTarget; input: ActivityInput }) =>
      api<TimelineEntry>("/activities", { method: "POST", body: { ...input, ...target } }),
    onSuccess: () => refreshAll(queryClient),
  });
}

export function useChangeActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<ActivityInput & { done: boolean }> }) =>
      api<TimelineEntry>(`/activities/${id}`, { method: "PATCH", body: changes }),
    onSuccess: () => refreshAll(queryClient),
  });
}

export function useDeleteActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/activities/${id}`, { method: "DELETE" }),
    onSuccess: () => refreshAll(queryClient),
  });
}
