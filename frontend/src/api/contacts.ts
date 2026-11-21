import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { refreshAll } from "./refresh";
import type { Contact, ContactDetail, ContactImpact, ContactInput, ContactSaved, TimelineEntry } from "./types";

export function useContacts() {
  return useQuery({ queryKey: ["contacts"], queryFn: () => api<Contact[]>("/contacts") });
}

export function useContact(id: number) {
  return useQuery({
    queryKey: ["contact", id],
    queryFn: () => api<ContactDetail>(`/contacts/${id}`),
    enabled: Number.isFinite(id),
  });
}

export function useContactTimeline(id: number, enabled = true) {
  return useQuery({
    queryKey: ["contact-timeline", id],
    queryFn: () => api<TimelineEntry[]>(`/contacts/${id}/timeline`),
    enabled: enabled && Number.isFinite(id),
  });
}

export function useContactImpact(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["contact-impact", id],
    queryFn: () => api<ContactImpact>(`/contacts/${id}/delete-impact`),
    enabled,
    gcTime: 0,
  });
}

export function useSaveContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: ContactInput }): Promise<ContactSaved> => {
      if (id === undefined) {
        const contact = await api<Contact>("/contacts", { method: "POST", body: input });
        return { contact, unlinked_deals: [] };
      }
      return api<ContactSaved>(`/contacts/${id}`, { method: "PATCH", body: input });
    },
    onSuccess: () => refreshAll(queryClient),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/contacts/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) =>
      refreshAll(queryClient, [
        ["contact", id],
        ["contact-timeline", id],
        ["contact-impact", id],
      ]),
  });
}
