import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { Dashboard } from "./types";

/** Worked out on the server each time the dashboard opens (DASH-9). */
export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/dashboard") });
}
