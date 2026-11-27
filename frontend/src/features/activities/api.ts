import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api, errorMessage, refreshAll } from '../../api'
import { useToast } from '../../components/Toast'
import type { StageName } from '../deals/api'

/** The activities a person adds; the system adds stage changes itself (R12). */
export const ENTERED_KINDS = ['note', 'call', 'email'] as const
export type EnteredKind = (typeof ENTERED_KINDS)[number]
export type ActivityKind = EnteredKind | 'stage_change'
export type FollowUpState = 'overdue' | 'today' | 'upcoming' | null

export type Activity = {
  id: number
  kind: ActivityKind
  contact_id: number | null
  contact_name: string | null
  deal_id: number | null
  deal_name: string | null
  description: string
  occurred_at: string
  follow_up_date: string | null
  follow_up_state: FollowUpState
  done: boolean
  from_stage: StageName | null
  to_stage: StageName | null
}

export type ActivityInput = {
  kind: EnteredKind
  contact_id: number | null
  deal_id: number | null
  description: string
  occurred_at: string
  follow_up_date: string | null
}

export const KIND_LABELS = { note: 'Note', call: 'Call', email: 'Email', stage_change: 'Stage change' }

export const saveActivity = (input: ActivityInput, id?: number) =>
  id ? api<Activity>(`/activities/${id}`, 'PATCH', input) : api<Activity>('/activities', 'POST', input)

export const setDone = (id: number, done: boolean) => api<Activity>(`/activities/${id}`, 'PATCH', { done })

/**
 * R37, R50: marks a follow-up done (or reopens it), refreshes every screen and says how it went.
 * Resolves to whether it was saved, so a checkbox can untick itself after a failure.
 */
export function useSetDone() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useCallback(
    async (a: Activity, done: boolean) => {
      try {
        await setDone(a.id, done)
        await refreshAll(queryClient)
        toast(done ? 'Follow-up marked done' : 'Follow-up reopened')
        return true
      } catch (e) {
        toast(errorMessage(e), 'error')
        return false
      }
    },
    [queryClient, toast],
  )
}
