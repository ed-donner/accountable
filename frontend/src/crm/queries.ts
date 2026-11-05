import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type Query,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";

import { api } from "../lib/api";
import { todayIso } from "../lib/dates";
import { useNotify } from "../lib/notify";
import { useWrite, type Authorship, type Person } from "../lib/records";
import { isSharedApp } from "../lib/session";
import { useToday } from "../lib/useToday";
import { applyMove, moveMessage, type Move } from "./deals";

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
export type OrganizationDetail = Organization & Authorship & { contacts: LinkedContact[]; deals: LinkedDeal[] };

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
export type ContactDetail = Contact & Authorship & { deals: LinkedDeal[] };

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
export type DealDetail = Deal & Authorship;
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
  /** Who logged the activity, or moved the deal for a stage change. */
  created_by: Person | null;
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
  return useQuery({ queryKey: ["deals", id], queryFn: () => api<DealDetail>(`/deals/${id}`) });
}

export function useDashboard() {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/dashboard") });

  // The backend works the figures out for one day, so a new day means reading them again.
  const today = useToday();
  const figuresFor = dashboard.data?.today;
  const { refetch } = dashboard;
  useEffect(() => {
    if (figuresFor !== undefined && figuresFor < today) void refetch();
  }, [figuresFor, today, refetch]);

  return dashboard;
}

const TIMELINE_PAGE = 50;

/** One page at a time, so a timeline of any length can be read to the end. */
export function useTimeline(kind: RecordKind, id: number) {
  const timeline = useInfiniteQuery({
    queryKey: [kind, id, "timeline"],
    queryFn: ({ pageParam }) => api<Timeline>(`/${kind}/${id}/timeline?limit=${TIMELINE_PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((count, page) => count + page.entries.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });

  // Pages go by place in the list, so a change made in another window moves what
  // the next page holds. Totals that differ show that happened, and reading every
  // page again puts it right.
  const pages = timeline.data?.pages;
  const shifted = pages?.some((page) => page.total !== pages[0].total) ?? false;
  const { refetch } = timeline;
  useEffect(() => {
    if (shifted) void refetch();
  }, [shifted, refetch]);

  return timeline;
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

const MOVE_KEY = ["move-deal"];

/**
 * The deals as the server last confirmed them, while moves are on their way.
 * It sits outside the hook because moves can finish after the board has gone.
 */
const confirmedDeals = new WeakMap<QueryClient, Deal[]>();

/**
 * Moves show at once. One scope means they're sent one at a time and in order,
 * and reads are cancelled first so an older reply can't overwrite the new state.
 * The messages live here because these handlers run for every move, where ones
 * passed to mutate only run for the latest.
 */
export function useMoveDeal() {
  const client = useQueryClient();
  const notify = useNotify();
  const meta = useMeta();

  const place = (deals: Deal[], move: Move) => applyMove(deals, move, meta.data?.stages ?? [], todayIso());

  /**
   * The board always shows what's confirmed plus every move still on its way, so
   * one move finishing can't bring back or undo another.
   */
  function show(confirmed: Deal[], finished?: Move) {
    const waiting = client
      .getMutationCache()
      .findAll({ mutationKey: MOVE_KEY, status: "pending" })
      .map((mutation) => mutation.state.variables as Move)
      .filter((move) => move !== finished);
    client.setQueryData(["deals"], waiting.reduce(place, confirmed));
  }

  return useMutation({
    mutationKey: MOVE_KEY,
    scope: { id: "deal-moves" },
    mutationFn: (move: Move) =>
      api<MoveResult>(`/deals/${move.dealId}/move`, {
        method: "POST",
        body: { stage: move.stage, before_deal_id: move.beforeDealId },
      }),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ["deals"], exact: true });
      const shown = client.getQueryData<Deal[]>(["deals"]);
      if (shown && !confirmedDeals.has(client)) confirmedDeals.set(client, shown);
      const confirmed = confirmedDeals.get(client);
      if (confirmed) show(confirmed);
    },
    onSuccess: (result, move) => {
      const { deal } = result;
      const confirmed = confirmedDeals.get(client);
      if (confirmed) {
        const landed = place(confirmed, move).map((item) =>
          item.id === deal.id ? { ...deal, position: item.position } : item,
        );
        confirmedDeals.set(client, landed);
        show(landed, move);
      }
      const message = moveMessage(result);
      if (message) notify.success(message);
    },
    onError: (_error, move) => {
      const confirmed = confirmedDeals.get(client);
      if (confirmed) show(confirmed, move);
      notify.error("Couldn't move that deal, so it's back where it was.");
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey: MOVE_KEY }) !== 1) return;
      confirmedDeals.delete(client);
      return client.invalidateQueries();
    },
  });
}

const TICK_KEY = ["tick-follow-up"];

/** The shared app is reached over the internet, and the local copy runs on this computer (N5). */
const TICK_FAILED = isSharedApp
  ? "Couldn't save that. Check your internet connection."
  : "Couldn't save that. Check that Accountable is still running.";

const timelines = { predicate: (query: Query) => query.queryKey[2] === "timeline" };

function setTicked(client: QueryClient, id: number, done: boolean) {
  client.setQueriesData<InfiniteData<Timeline>>(timelines, (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            entries: page.entries.map((entry) =>
              entry.kind === "activity" && entry.id === id ? { ...entry, follow_up_done: done } : entry,
            ),
          })),
        }
      : old,
  );
}

function setFollowUps(client: QueryClient, change: (items: FollowUp[]) => FollowUp[]) {
  client.setQueryData<Dashboard>(["dashboard"], (old) => {
    if (!old) return old;
    const items = change(old.follow_ups.items);
    const overdue = items.filter((item) => item.overdue).length;
    return { ...old, overdue_follow_ups: overdue, follow_ups: { overdue, upcoming: items.length - overdue, items } };
  });
}

function byDueDate(a: FollowUp, b: FollowUp) {
  return a.follow_up_date.localeCompare(b.follow_up_date) || a.id - b.id;
}

/**
 * Ticks update the screen at once. A failed one puts back only its own follow-up,
 * so it can't undo or bring back another, and everything is read again once, after
 * the last, because a read before then would show later ticks as not done yet.
 */
export function useTickFollowUp() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationKey: TICK_KEY,
    scope: { id: "follow-up-ticks" },
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      api<Activity>(`/activities/${id}`, { method: "PATCH", body: { follow_up_done: done } }),
    onMutate: async ({ id, done }) => {
      await Promise.all([client.cancelQueries({ queryKey: ["dashboard"] }), client.cancelQueries(timelines)]);
      setTicked(client, id, done);
      const dashboard = client.getQueryData<Dashboard>(["dashboard"]);
      const followUp = done ? dashboard?.follow_ups.items.find((item) => item.id === id) : undefined;
      if (followUp) setFollowUps(client, (items) => items.filter((item) => item.id !== id));
      return { followUp };
    },
    onError: (_error, { id, done }, context) => {
      setTicked(client, id, !done);
      const followUp = context?.followUp;
      if (followUp) setFollowUps(client, (items) => [...items, followUp].sort(byDueDate));
      notify.error(TICK_FAILED);
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey: TICK_KEY }) === 1) return client.invalidateQueries();
    },
  });
}
