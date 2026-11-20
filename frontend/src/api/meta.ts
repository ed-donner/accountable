import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { Meta } from "./types";

/** Today's date from the backend, the app's one clock (plan, decision 5). */
export function useMeta() {
  return useQuery({
    queryKey: ["meta"],
    queryFn: () => api<Meta>("/meta"),
    staleTime: 60_000,
  });
}

export function useToday(): string | undefined {
  return useMeta().data?.today;
}
