import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

import { queryDefaults } from "./App";

export const META = {
  stages: [
    { key: "new", name: "New", probability: 5, open: true },
    { key: "qualified", name: "Qualified", probability: 20, open: true },
    { key: "proposal", name: "Proposal", probability: 40, open: true },
    { key: "negotiation", name: "Negotiation", probability: 70, open: true },
    { key: "won", name: "Won", probability: 100, open: false },
    { key: "lost", name: "Lost", probability: 0, open: false },
  ],
  statuses: ["lead", "qualified", "customer"],
  activity_types: ["note", "call", "email"],
};

export type Call = { method: string; path: string; body: unknown };

type Handler = (body: any) => { status?: number; body: unknown };

/** Stands in for the backend. Keys are "METHOD /path". Returns the calls made. */
export function mockApi(routes: Record<string, unknown | Handler>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = url.replace(/^\/api/, "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const route = routes[`${method} ${path}`];
    if (route === undefined) {
      return new Response(JSON.stringify({ detail: "No route in the test" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const answer = typeof route === "function" ? (route as Handler)(body) : { body: route };
    if (answer.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(answer.body), {
      status: answer.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

export function renderApp(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: queryDefaults });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

export function user() {
  // Radix sets pointer-events on the body while a dialog is open.
  return userEvent.setup({ pointerEventsCheck: 0 });
}
