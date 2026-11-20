import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import type { Dashboard, Deal, OrganizationDetail, TimelineEntry } from "@/api/types";

type Answer = { __reply: true; status: number; body?: unknown };

/** An answer with a status, such as reply(422, { detail: [...] }) or reply(204). */
export function reply(status: number, body?: unknown): Answer {
  return { __reply: true, status, body };
}
type Handler = (body: unknown) => Answer | unknown;

/**
 * A fake API for component tests. Routes are keyed by "METHOD /path", such as
 * "GET /api/meta". A route gives the JSON body, or reply(status, body).
 */
export function fakeApi(routes: Record<string, Handler | unknown>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, body });
    const key = `${method} ${url.pathname}`;
    if (!(key in routes)) return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
    const route = routes[key];
    const result = typeof route === "function" ? (route as Handler)(body) : route;
    const answer: Answer =
      result && typeof result === "object" && "__reply" in (result as object)
        ? (result as Answer)
        : { __reply: true, status: 200, body: result };
    const status = answer.status;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(answer.body ?? null), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export function renderWithApp(ui: ReactElement, { route = "/" }: { route?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <TooltipProvider>
          {ui}
          <Toaster />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, user, queryClient };
}

// Sample records for the tests.

export const META = { today: "2026-11-19" };

export const ORGS = [
  {
    id: 1,
    name: "Bluefin Logistics",
    website: null,
    industry: "Logistics",
    notes: null,
    contact_count: 2,
    open_deal_count: 1,
    open_pipeline: 48500,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    name: "Cedar Health",
    website: null,
    industry: "Healthcare",
    notes: null,
    contact_count: 1,
    open_deal_count: 0,
    open_pipeline: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

export const CONTACTS = [
  {
    id: 10,
    name: "Sarah Chen",
    email: null,
    phone: null,
    job_title: "Head of Ops",
    status: "customer",
    organization: { id: 1, name: "Bluefin Logistics" },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 11,
    name: "Tom Reyes",
    email: null,
    phone: null,
    job_title: null,
    status: "lead",
    organization: { id: 1, name: "Bluefin Logistics" },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 12,
    name: "Amir Haddad",
    email: null,
    phone: null,
    job_title: null,
    status: "customer",
    organization: { id: 2, name: "Cedar Health" },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
] as const;

export const DEAL = {
  id: 100,
  name: "Website redesign",
  organization: { id: 1, name: "Bluefin Logistics" },
  main_contact: { id: 10, name: "Sarah Chen" },
  stage: "qualified",
  value: 48500,
  probability: 25,
  expected_value: 12125,
  close_date: "2026-12-12",
  is_late: false,
  position: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as const;

/** The sample deal, with any fields changed. */
export function deal(changes: Partial<Deal> = {}): Deal {
  return { ...DEAL, ...changes };
}

/** A call on Sarah Chen's timeline, with any fields changed. */
export function entry(changes: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: 1,
    type: "call",
    description: "Talked through the brief",
    occurred_at: "2026-11-18T17:00:00Z",
    follow_up_date: null,
    done: false,
    from_stage: null,
    to_stage: null,
    contact: { id: 10, name: "Sarah Chen" },
    deal: null,
    ...changes,
  };
}

/** Bluefin Logistics' page, with two contacts and the sample deal. */
export function organizationDetail(changes: Partial<OrganizationDetail> = {}): OrganizationDetail {
  return {
    ...ORGS[0],
    website: "https://bluefin.example",
    notes: "Three depots.",
    revenue_won: 22000,
    contacts: [
      { id: 10, name: "Sarah Chen", status: "customer", job_title: "Head of Ops" },
      { id: 11, name: "Tom Reyes", status: "lead", job_title: null },
    ],
    deals: [deal()],
    ...changes,
  };
}

/** A dashboard on Thursday, November 19, 2026, with one of everything. */
export function dashboard(changes: Partial<Dashboard> = {}): Dashboard {
  const months = [
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
  ];
  return {
    today: "2026-11-19",
    open_pipeline: { value: 1_011_000, count: 18 },
    expected_revenue: 502_300,
    won_this_month: { value: 48_500, count: 1, last_month_value: 22_000 },
    follow_up_counts: { overdue: 2, due_soon: 3 },
    months: months.map((month, index) => ({ month, revenue: index === 11 ? 48_500 : 0, deals: index === 11 ? 1 : 0 })),
    funnel: [
      { stage: "new", count: 30, value: 1_400_000 },
      { stage: "qualified", count: 20, value: 900_000 },
      { stage: "proposal", count: 12, value: 600_000 },
      { stage: "negotiation", count: 6, value: 300_000 },
      { stage: "won", count: 4, value: 150_000 },
    ],
    open_by_stage: [
      { stage: "new", count: 6, value: 300_000, expected: 30_000 },
      { stage: "qualified", count: 5, value: 250_000, expected: 62_500 },
      { stage: "proposal", count: 4, value: 260_000, expected: 130_000 },
      { stage: "negotiation", count: 3, value: 201_000, expected: 150_750 },
    ],
    follow_ups: [{ ...entry({ id: 7, description: "Send the proposal", follow_up_date: "2026-11-17" }), days_late: 2 }],
    recent: [entry({ id: 8, description: "Kickoff call booked", occurred_at: "2026-11-19T16:00:00Z" })],
    ...changes,
  };
}
