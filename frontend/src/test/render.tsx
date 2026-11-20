import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

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
  { id: 1, name: "Bluefin Logistics", website: null, industry: "Logistics", notes: null, contact_count: 2, open_deal_count: 1, open_pipeline: 48500, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: 2, name: "Cedar Health", website: null, industry: "Healthcare", notes: null, contact_count: 1, open_deal_count: 0, open_pipeline: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];

export const CONTACTS = [
  { id: 10, name: "Sarah Chen", email: null, phone: null, job_title: "Head of Ops", status: "customer", organization: { id: 1, name: "Bluefin Logistics" }, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: 11, name: "Tom Reyes", email: null, phone: null, job_title: null, status: "lead", organization: { id: 1, name: "Bluefin Logistics" }, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: 12, name: "Amir Haddad", email: null, phone: null, job_title: null, status: "customer", organization: { id: 2, name: "Cedar Health" }, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
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
