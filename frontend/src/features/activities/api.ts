import { api } from '../../api'
import type { StageName } from '../deals/api'

export type ActivityKind = 'note' | 'call' | 'email' | 'stage_change'
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
  kind: 'note' | 'call' | 'email'
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
