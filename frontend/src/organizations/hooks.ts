import { useQuery } from "@tanstack/react-query";
import { api, type Schemas } from "../shared/api";
import { useSaveRecord } from "../shared/queryClient";

export type OrganizationRow = Schemas["OrganizationRow"];
export type Organization = Schemas["Organization"];
export type OrganizationDetail = Schemas["OrganizationDetail"];

export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: () => api<Schemas["OrganizationList"]>("/organizations"),
  });
}

export function useOrganization(id: number) {
  return useQuery({
    queryKey: ["organization", id],
    queryFn: () => api<OrganizationDetail>(`/organizations/${id}`),
    retry: false,
  });
}

export function useSaveOrganization() {
  return useSaveRecord<Organization>("/organizations");
}
