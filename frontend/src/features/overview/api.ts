import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import type { Activity } from '../activities/api'
import type { StageName } from '../deals/api'

export type MonthFigures = { month: string; label: string; year: number; revenue_cents: number; won_count: number }

export type Dashboard = {
  today: string
  open_count: number
  open_value_cents: number
  open_expected_cents: number
  late_count: number
  open_by_stage: { stage: StageName; count: number; value_cents: number; expected_cents: number }[]
  won_this_month: MonthFigures
  win_rate: number | null
  won_last_12: number
  closed_last_12: number
  won_value_last_12_cents: number
  monthly: MonthFigures[]
  funnel: { stage: StageName; count: number; value_cents: number }[]
  recent_activity: Activity[]
  follow_ups: { overdue: Activity[]; today: Activity[]; upcoming: Activity[] }
}

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') })
}
