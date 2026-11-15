import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import type { Activity } from '../activities/api'

export const STAGE_NAMES = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const
export type StageName = (typeof STAGE_NAMES)[number]

export type Stage = { name: StageName; probability: number; open: boolean }

export type Deal = {
  id: number
  name: string
  organization_id: number
  organization_name: string
  main_contact_id: number | null
  contact_name: string | null
  stage: StageName
  value_cents: number
  probability: number
  expected_cents: number
  close_date: string
  is_late: boolean
  position: number
}

export type DealDetail = Deal & { timeline: Activity[] }

export type DealInput = {
  name: string
  organization_id: number
  main_contact_id: number | null
  stage: StageName
  value_cents: number
  probability?: number
  close_date: string
}

export const isOpenStage = (stage: StageName) => stage !== 'Won' && stage !== 'Lost'

export function useStages() {
  return useQuery({ queryKey: ['stages'], queryFn: () => api<Stage[]>('/stages'), staleTime: Infinity })
}

export function useDeals() {
  return useQuery({ queryKey: ['deals'], queryFn: () => api<Deal[]>('/deals') })
}

export function useDeal(id: number) {
  return useQuery({ queryKey: ['deals', id], queryFn: () => api<DealDetail>(`/deals/${id}`) })
}

export const saveDeal = (input: DealInput, id?: number) =>
  id ? api<Deal>(`/deals/${id}`, 'PATCH', input) : api<Deal>('/deals', 'POST', input)
