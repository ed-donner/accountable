import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { refreshAll } from "./refresh";
import type { OrganizationDetail, OrganizationImpact, OrganizationInput, OrganizationRow } from "./types";

export function useOrganizations() {
  return useQuery({ queryKey: ["organizations"], queryFn: () => api<OrganizationRow[]>("/organizations") });
}

export function useOrganization(id: number) {
  return useQuery({
    queryKey: ["organization", id],
    queryFn: () => api<OrganizationDetail>(`/organizations/${id}`),
    enabled: Number.isFinite(id),
  });
}

export function useOrganizationImpact(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["organization-impact", id],
    queryFn: () => api<OrganizationImpact>(`/organizations/${id}/delete-impact`),
    enabled,
    gcTime: 0,
  });
}

export function useSaveOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: OrganizationInput }) =>
      id === undefined
        ? api<OrganizationDetail>("/organizations", { method: "POST", body: input })
        : api<OrganizationDetail>(`/organizations/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => refreshAll(queryClient),
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/organizations/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => refreshAll(queryClient, [["organization", id], ["organization-impact", id]]),
  });
}
