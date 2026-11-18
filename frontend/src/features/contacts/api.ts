import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import type { Activity } from '../activities/api'
import type { Deal } from '../deals/api'

export const STATUSES = ['lead', 'qualified', 'customer'] as const
export type Status = (typeof STATUSES)[number]
export const STATUS_LABELS: Record<Status, string> = { lead: 'Lead', qualified: 'Qualified', customer: 'Customer' }

export type Contact = {
  id: number
  name: string
  email: string | null
  phone: string | null
  job_title: string | null
  organization_id: number | null
  organization_name: string | null
  status: Status
}

export type ContactDetail = Contact & { deals: Deal[]; timeline: Activity[] }

export type ContactInput = {
  name: string
  email: string | null
  phone: string | null
  job_title: string | null
  organization_id: number | null
  status: Status
}

export function useContacts() {
  return useQuery({ queryKey: ['contacts'], queryFn: () => api<Contact[]>('/contacts') })
}

export function useContact(id: number) {
  return useQuery({ queryKey: ['contacts', id], queryFn: () => api<ContactDetail>(`/contacts/${id}`) })
}

export const saveContact = (input: ContactInput, id?: number) =>
  id ? api<Contact>(`/contacts/${id}`, 'PATCH', input) : api<Contact>('/contacts', 'POST', input)
