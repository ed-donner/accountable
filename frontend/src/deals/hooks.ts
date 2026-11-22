import { useQuery } from "@tanstack/react-query";
import { api, type Schemas } from "../shared/api";
import { useSaveRecord } from "../shared/queryClient";
import type { Stage } from "../shared/stages";

export type DealRow = Schemas["DealRow"];

export function useDeals(stage?: Stage | null) {
  return useQuery({
    queryKey: ["deals", stage ?? "all"],
    queryFn: () => api<Schemas["DealList"]>(stage ? `/deals?stage=${stage}` : "/deals"),
    placeholderData: (previous) => previous,
  });
}

export function useDeal(id: number) {
  return useQuery({
    queryKey: ["deal", id],
    queryFn: () => api<DealRow>(`/deals/${id}`),
    retry: false,
  });
}

export function useSaveDeal() {
  return useSaveRecord<DealRow>("/deals");
}
