import { useQuery } from "@tanstack/react-query";
import { api, type Schemas } from "../shared/api";

export type Dashboard = Schemas["Dashboard"];

/** H8: fetched fresh each time the dashboard opens. */
export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/dashboard"),
  });
}
