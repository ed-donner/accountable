import { useQuery } from "@tanstack/react-query";
import { api, type Schemas } from "../shared/api";
import { useSaveRecord } from "../shared/queryClient";
import type { Status } from "../shared/stages";

export type ContactRow = Schemas["ContactRow"];
export type Contact = Schemas["Contact"];
export type ContactDetail = Schemas["ContactDetail"];

export function useContacts(status?: Status | null) {
  return useQuery({
    queryKey: ["contacts", status ?? "all"],
    queryFn: () => api<Schemas["ContactList"]>(status ? `/contacts?status=${status}` : "/contacts"),
    placeholderData: (previous) => previous,
  });
}

export function useContact(id: number) {
  return useQuery({
    queryKey: ["contact", id],
    queryFn: () => api<ContactDetail>(`/contacts/${id}`),
    retry: false,
  });
}

export function useSaveContact() {
  return useSaveRecord<Contact>("/contacts");
}
