import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { refreshAll } from "./refresh";
import type { Deal, DealImpact, DealInput, Stage, TimelineEntry } from "./types";

export function useDeals() {
  return useQuery({ queryKey: ["deals"], queryFn: () => api<Deal[]>("/deals") });
}

export function useDeal(id: number) {
  return useQuery({ queryKey: ["deal", id], queryFn: () => api<Deal>(`/deals/${id}`), enabled: Number.isFinite(id) });
}

export function useDealTimeline(id: number, enabled = true) {
  return useQuery({
    queryKey: ["deal-timeline", id],
    queryFn: () => api<TimelineEntry[]>(`/deals/${id}/timeline`),
    enabled: enabled && Number.isFinite(id),
  });
}

export function useDealImpact(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["deal-impact", id],
    queryFn: () => api<DealImpact>(`/deals/${id}/delete-impact`),
    enabled,
    gcTime: 0,
  });
}

export function useSaveDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: Partial<DealInput> }) =>
      id === undefined
        ? api<Deal>("/deals", { method: "POST", body: input })
        : api<Deal>(`/deals/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => refreshAll(queryClient),
  });
}

/** The stage bar sends only the stage, so the deal gets the stage's defaults (DEAL-5). */
export function useChangeStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: Stage }) =>
      api<Deal>(`/deals/${id}`, { method: "PATCH", body: { stage } }),
    onSuccess: () => refreshAll(queryClient),
  });
}

export function useDeleteDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/deals/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => refreshAll(queryClient, [["deal", id], ["deal-timeline", id], ["deal-impact", id]]),
  });
}
