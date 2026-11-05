import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

import { queryDefaults } from "./lib/queryDefaults";
import { STAGES } from "./crm/deals";
import type { Stage } from "./crm/queries";
import { SESSION_KEY } from "./lib/session";

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

type Handler = (body: unknown) => { status?: number; body: unknown };

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

/**
 * Keeps every save unanswered until released, on top of mockApi. The stand-in backend
 * answers at once, which would finish the first save before a second press could overlap it.
 */
export function holdSaves() {
  let release = () => undefined as void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const answer = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    if (init.method && init.method !== "GET") await held;
    return answer(url, init);
  });
  return release;
}

/**
 * Starts the test signed in to the local copy, the way a tab does when another tab
 * signs in. mockApi takes any token. test-setup.ts signs out after each test.
 */
export function startSignedIn(token = "test-token") {
  localStorage.setItem(SESSION_KEY, token);
  window.dispatchEvent(new StorageEvent("storage", { key: SESSION_KEY }));
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

// The board's layout. jsdom lays nothing out, so dnd-kit would find every card and
// column at 0,0. This gives the board a plain layout: six columns side by side,
// each with its cards stacked under a header.
export const COLUMN_WIDTH = 200;
const CARD_WIDTH = 190;
const HEADER_HEIGHT = 150;
const LIST_HEIGHT = 700;
const LIST_PADDING = 8;
const CARD_HEIGHT = 100;
const CARD_STEP = 108;

function offsetInList(card: HTMLElement): number {
  const cards = [...card.parentElement!.querySelectorAll("[data-deal-id]")];
  return LIST_PADDING + cards.indexOf(card) * CARD_STEP;
}

function layOut(element: HTMLElement): DOMRect {
  // The card that follows the pointer, which dnd-kit places with inline styles.
  const lifted = element.closest<HTMLElement>('[style*="position: fixed"]');
  if (lifted) {
    const { left, top, width, height } = lifted.style;
    return new DOMRect(parseFloat(left), parseFloat(top), parseFloat(width), parseFloat(height));
  }
  const column = element.closest<HTMLElement>('section[data-testid^="column-"]');
  if (!column) return new DOMRect();
  const left = STAGES.indexOf(column.dataset.testid!.replace("column-", "") as Stage) * COLUMN_WIDTH;
  const card = element.closest<HTMLElement>("[data-deal-id]");
  if (card) return new DOMRect(left, HEADER_HEIGHT + offsetInList(card), CARD_WIDTH, CARD_HEIGHT);
  return new DOMRect(left, HEADER_HEIGHT, CARD_WIDTH, LIST_HEIGHT);
}

/** Lays the board out until the test ends, when vitest's restoreMocks undoes it. */
export function layOutBoard() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return layOut(this);
  });
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset.dealId ? offsetInList(this) : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset.dealId ? CARD_HEIGHT : 0;
  });
}

/** The middle of an element, where a pointer would press it. */
export function middleOf(element: HTMLElement) {
  const { left, top, width, height } = layOut(element);
  return { clientX: left + width / 2, clientY: top + height / 2 };
}
