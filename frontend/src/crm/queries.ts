import { useMutation, useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "../lib/api";
import { todayIso } from "../lib/dates";
import { applyMove, type Move } from "./deals";

export type Stage = "new" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
export type Status = "lead" | "qualified" | "customer";
export type ActivityType = "note" | "call" | "email";

export type Meta = {
  stages: { key: Stage; name: string; probability: number; open: boolean }[];
  statuses: Status[];
  activity_types: ActivityType[];
};

export type LinkedContact = { id: number; name: string; job_title: string | null; status: Status };
export type LinkedDeal = { id: number; name: string; stage: Stage; value: number; close_date: string };

export type Organization = {
  id: number;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
};
export type OrganizationRow = Organization & {
  contact_count: number;
  open_deal_count: number;
  open_value: number;
  last_activity: string | null;
};
export type OrganizationDetail = Organization & { contacts: LinkedContact[]; deals: LinkedDeal[] };

export type Contact = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  organization_id: number | null;
  organization_name: string | null;
  status: Status;
};
export type ContactRow = Contact & { last_activity: string | null };
export type ContactDetail = Contact & { deals: LinkedDeal[] };

export type Deal = {
  id: number;
  name: string;
  organization_id: number | null;
  organization_name: string | null;
  main_contact_id: number | null;
  main_contact_name: string | null;
  stage: Stage;
  value: number;
  probability: number;
  expected_revenue: number;
  close_date: string;
  position: number;
};
export type MoveResult = { deal: Deal; changes: { close_date: string | null; new_customer: string | null } };

export type About = { kind: "contact" | "deal"; id: number; name: string };
export type TimelineEntry = {
  kind: "activity" | "stage_change";
  id: number;
  at: string;
  type: ActivityType | null;
  description: string;
  follow_up_date: string | null;
  follow_up_done: boolean;
  about: About;
};
export type Timeline = { entries: TimelineEntry[]; total: number };

export type Activity = {
  id: number;
  type: ActivityType;
  contact_id: number | null;
  deal_id: number | null;
  description: string;
  occurred_at: string;
  follow_up_date: string | null;
  follow_up_done: boolean;
};

export type FollowUp = { id: number; description: string; follow_up_date: string; overdue: boolean; about: About };

export type Dashboard = {
  today: string;
  overdue_follow_ups: number;
  late_deals: number;
  revenue_this_month: number;
  revenue_last_month: number;
  deals_won_this_month: number;
  deals_won_last_month: number;
  open_pipeline: number;
  open_deals: number;
  expected_revenue: number;
  expected_share: number;
  months: { month: string; label: string; revenue: number; deals: number }[];
  band: { stage: Stage; value: number; count: number }[];
  funnel: { stage: Stage; value: number; carried: number | null }[];
  follow_ups: { overdue: number; upcoming: number; items: FollowUp[] };
  recent: TimelineEntry[];
};

export type RecordKind = "organizations" | "contacts" | "deals";

export type OrganizationImpact = { contacts: number; deals: number };
export type ContactImpact = { deals: number; activities: number };
export type DealImpact = { activities: number; stage_changes: number; won: boolean; value: number };

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/meta"), staleTime: Infinity });
}

export function useOrganizations() {
  return useQuery({ queryKey: ["organizations"], queryFn: () => api<OrganizationRow[]>("/organizations") });
}

export function useOrganization(id: number) {
  return useQuery({
    queryKey: ["organizations", id],
    queryFn: () => api<OrganizationDetail>(`/organizations/${id}`),
  });
}

export function useContacts() {
  return useQuery({ queryKey: ["contacts"], queryFn: () => api<ContactRow[]>("/contacts") });
}

export function useContact(id: number) {
  return useQuery({ queryKey: ["contacts", id], queryFn: () => api<ContactDetail>(`/contacts/${id}`) });
}

export function useDeals() {
  return useQuery({ queryKey: ["deals"], queryFn: () => api<Deal[]>("/deals") });
}

export function useDeal(id: number) {
  return useQuery({ queryKey: ["deals", id], queryFn: () => api<Deal>(`/deals/${id}`) });
}

export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/dashboard") });
}

export function useDeleteImpact<T>(kind: RecordKind, id: number) {
  return useQuery({
    queryKey: [kind, id, "impact"],
    queryFn: () => api<T>(`/${kind}/${id}/delete-impact`),
    gcTime: 0,
  });
}

export const TIMELINE_PAGE = 50;

export function useTimeline(kind: RecordKind, id: number, limit: number) {
  return useQuery({
    queryKey: [kind, id, "timeline", limit],
    queryFn: () => api<Timeline>(`/${kind}/${id}/timeline?limit=${limit}&offset=0`),
    placeholderData: (previous) => previous,
  });
}

function useWrite<Input, Result>(write: (input: Input) => Promise<Result>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: write, onSuccess: () => client.invalidateQueries() });
}

export type OrganizationValues = Pick<Organization, "name" | "website" | "industry" | "notes">;
export type ContactValues = Pick<Contact, "name" | "email" | "phone" | "job_title" | "organization_id" | "status">;
export type DealValues = Pick<
  Deal,
  "name" | "organization_id" | "main_contact_id" | "stage" | "value" | "probability" | "close_date"
>;
export type ActivityValues = {
  type: ActivityType;
  description: string;
  occurred_at: string;
  follow_up_date: string | null;
  follow_up_done: boolean;
};

export function useSaveOrganization(id?: number) {
  return useWrite((values: OrganizationValues) =>
    id === undefined
      ? api<OrganizationDetail>("/organizations", { method: "POST", body: values })
      : api<OrganizationDetail>(`/organizations/${id}`, { method: "PATCH", body: values }),
  );
}

export function useSaveContact(id?: number) {
  return useWrite((values: ContactValues) =>
    id === undefined
      ? api<ContactDetail>("/contacts", { method: "POST", body: values })
      : api<ContactDetail>(`/contacts/${id}`, { method: "PATCH", body: values }),
  );
}

export function useSaveDeal(id?: number) {
  return useWrite((values: DealValues) =>
    id === undefined
      ? api<Deal>("/deals", { method: "POST", body: values })
      : api<Deal>(`/deals/${id}`, { method: "PATCH", body: values }),
  );
}

export function useAddActivity(link: { contact_id: number } | { deal_id: number }) {
  return useWrite((values: ActivityValues) =>
    api<Activity>("/activities", { method: "POST", body: { ...values, ...link } }),
  );
}

export function useEditActivity(id: number) {
  return useWrite((values: Partial<ActivityValues>) =>
    api<Activity>(`/activities/${id}`, { method: "PATCH", body: values }),
  );
}

export function useDeleteActivity() {
  return useWrite((id: number) => api<void>(`/activities/${id}`, { method: "DELETE" }));
}

/**
 * Leaves the deleted record's own queries alone, so a page that's about to close
 * doesn't refetch it and log a 404.
 */
export function useDeleteRecord(kind: RecordKind, id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/${kind}/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      client.invalidateQueries({
        predicate: (query) => !(query.queryKey[0] === kind && query.queryKey[1] === id),
      }),
  });
}

const MOVE_KEY = ["move-deal"];

/**
 * Moves show at once. One scope means they're sent one at a time and in order,
 * and reads are cancelled first so an older reply can't overwrite the new state.
 */
export function useMoveDeal() {
  const client = useQueryClient();
  const meta = useMeta();
  return useMutation({
    mutationKey: MOVE_KEY,
    scope: { id: "deal-moves" },
    mutationFn: (move: Move) =>
      api<MoveResult>(`/deals/${move.dealId}/move`, {
        method: "POST",
        body: { stage: move.stage, before_deal_id: move.beforeDealId },
      }),
    onMutate: async (move) => {
      await client.cancelQueries({ queryKey: ["deals"], exact: true });
      const previous = client.getQueryData<Deal[]>(["deals"]);
      if (previous && meta.data) {
        client.setQueryData(["deals"], applyMove(previous, move, meta.data.stages, todayIso()));
      }
      return { previous };
    },
    onSuccess: ({ deal }) => {
      client.setQueryData<Deal[]>(["deals"], (current) =>
        current?.map((item) => (item.id === deal.id ? { ...deal, position: item.position } : item)),
      );
    },
    onError: (_error, _move, context) => {
      if (context?.previous) client.setQueryData(["deals"], context.previous);
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey: MOVE_KEY }) === 1) return client.invalidateQueries();
    },
  });
}

const FOLLOW_UP_TICK = { scope: { id: "follow-up-ticks" } };

/** Ticks update the screen at once and put it back if the save fails. */
export function useTickFollowUp() {
  const client = useQueryClient();
  return useMutation({
    ...FOLLOW_UP_TICK,
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      api<Activity>(`/activities/${id}`, { method: "PATCH", body: { follow_up_done: done } }),
    onMutate: async ({ id, done }) => {
      const timelines = { predicate: (query: Query) => query.queryKey[2] === "timeline" };
      await Promise.all([client.cancelQueries({ queryKey: ["dashboard"] }), client.cancelQueries(timelines)]);

      const previousTimelines = client.getQueriesData<Timeline>(timelines);
      client.setQueriesData<Timeline>(timelines, (old) =>
        old
          ? {
              ...old,
              entries: old.entries.map((entry) =>
                entry.kind === "activity" && entry.id === id ? { ...entry, follow_up_done: done } : entry,
              ),
            }
          : old,
      );

      const previous = client.getQueryData<Dashboard>(["dashboard"]);
      if (previous && done) {
        const items = previous.follow_ups.items.filter((item) => item.id !== id);
        const overdue = items.filter((item) => item.overdue).length;
        client.setQueryData<Dashboard>(["dashboard"], {
          ...previous,
          overdue_follow_ups: overdue,
          follow_ups: { overdue, upcoming: items.length - overdue, items },
        });
      }
      return { previous, previousTimelines };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(["dashboard"], context.previous);
      context?.previousTimelines.forEach(([key, data]) => client.setQueryData(key, data));
      toast.error("Couldn't save that. Check that Accountable is still running.");
    },
    onSettled: () => client.invalidateQueries(),
  });
}
