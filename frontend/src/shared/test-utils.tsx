import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "./Toast";

export function testClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

export function renderWithProviders(ui: ReactElement, client = testClient()) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ToastProvider>{ui}</ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

type Handler = (body: unknown, method: string) => { status?: number; body?: unknown };

/** Stubs fetch with handlers keyed by "METHOD /path". Returns the calls made. */
export function mockApi(routes: Record<string, Handler | unknown>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const path = url.replace(/^\/api/, "");
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body });
      const route = routes[`${method} ${path}`];
      if (route === undefined) return new Response(JSON.stringify({ message: "not mocked" }), { status: 404 });
      const reply = typeof route === "function" ? (route as Handler)(body, method) : { body: route };
      return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return calls;
}
