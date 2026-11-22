import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type Schemas } from "../shared/api";
import { useRefreshAll, useSaveRecord } from "../shared/queryClient";

export type TimelineEntry = Schemas["TimelineEntry"];
export type Activity = Schemas["Activity"];

export function useTimeline(kind: "contact" | "deal", id: number) {
  return useQuery({
    queryKey: ["timeline", kind, id],
    queryFn: () => api<Schemas["Timeline"]>(`/${kind}s/${id}/timeline`),
    retry: false,
  });
}

export function useSaveActivity() {
  return useSaveRecord<Activity>("/activities");
}

export function useDeleteActivity() {
  const refreshAll = useRefreshAll();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/activities/${id}`, "DELETE"),
    onSuccess: () => refreshAll(),
  });
}

/** A6: Mark done takes a follow-up off the dashboard. */
export function useMarkDone() {
  const refreshAll = useRefreshAll();
  return useMutation({
    mutationFn: (id: number) => api<Activity>(`/activities/${id}`, "PATCH", { done: true }),
    onSuccess: () => refreshAll(),
  });
}
