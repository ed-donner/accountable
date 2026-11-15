import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import type { Contact } from '../contacts/api'
import type { Deal } from '../deals/api'

export type Organization = {
  id: number
  name: string
  website: string | null
  industry: string | null
  notes: string | null
  contact_count: number
  deal_count: number
  open_deal_value_cents: number
}

export type OrganizationDetail = Organization & { contacts: Contact[]; deals: Deal[] }

export type OrganizationInput = {
  name: string
  website: string | null
  industry: string | null
  notes: string | null
}

export function useOrganizations() {
  return useQuery({ queryKey: ['organizations'], queryFn: () => api<Organization[]>('/organizations') })
}

export function useOrganization(id: number) {
  return useQuery({ queryKey: ['organizations', id], queryFn: () => api<OrganizationDetail>(`/organizations/${id}`) })
}

export const saveOrganization = (input: OrganizationInput, id?: number) =>
  id ? api<Organization>(`/organizations/${id}`, 'PATCH', input) : api<Organization>('/organizations', 'POST', input)
