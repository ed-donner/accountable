import type { Stage, Status } from "@/lib/rules";

export type { Stage, Status };
export type ActivityType = "note" | "call" | "email" | "stage_change";
export type LoggableType = "note" | "call" | "email";

export type Ref = { id: number; name: string };

export type Meta = { today: string };

export type Deal = {
  id: number;
  name: string;
  organization: Ref;
  main_contact: Ref | null;
  stage: Stage;
  value: number;
  probability: number;
  expected_value: number;
  close_date: string;
  is_late: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export type DealSummary = { id: number; name: string; stage: Stage; value: number };

export type OrganizationRow = {
  id: number;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
  contact_count: number;
  open_deal_count: number;
  open_pipeline: number;
  created_at: string;
  updated_at: string;
};

export type OrganizationContact = { id: number; name: string; status: Status; job_title: string | null };

export type OrganizationDetail = OrganizationRow & {
  revenue_won: number;
  contacts: OrganizationContact[];
  deals: Deal[];
};

export type Contact = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  status: Status;
  organization: Ref | null;
  created_at: string;
  updated_at: string;
};

export type ContactDetail = Contact & { deals: Deal[] };

export type ContactSaved = { contact: Contact; unlinked_deals: Ref[] };

export type TimelineEntry = {
  id: number;
  type: ActivityType;
  description: string;
  occurred_at: string;
  follow_up_date: string | null;
  done: boolean;
  from_stage: Stage | null;
  to_stage: Stage | null;
  contact: Ref | null;
  deal: Ref | null;
};

export type FollowUp = TimelineEntry & { days_late: number };

export type OrganizationImpact = { contacts: number; deals: DealSummary[] };
export type ContactImpact = { activities: number; deals: Ref[] };
export type DealImpact = { activities: number; stage_changes: number };

export type PipelineColumn = { stage: Stage; deals: Deal[] };
export type Pipeline = { columns: PipelineColumn[] };

export type Dashboard = {
  today: string;
  open_pipeline: { value: number; count: number };
  expected_revenue: number;
  won_this_month: { value: number; count: number; last_month_value: number };
  follow_up_counts: { overdue: number; due_soon: number };
  months: { month: string; revenue: number; deals: number }[];
  funnel: { stage: Stage; count: number; value: number }[];
  open_by_stage: { stage: Stage; count: number; value: number; expected: number }[];
  follow_ups: FollowUp[];
  recent: TimelineEntry[];
};

// What the forms send.

export type OrganizationInput = {
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
};

export type ContactInput = {
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  organization_id: number | null;
  status: Status;
};

export type DealInput = {
  name: string;
  organization_id: number;
  main_contact_id: number | null;
  stage: Stage;
  value: number;
  probability: number;
  close_date: string;
};

export type ActivityInput = {
  type: LoggableType;
  description: string;
  occurred_at: string;
  follow_up_date: string | null;
};
