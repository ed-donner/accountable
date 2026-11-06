import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user, type Call } from "../../test-utils";
import { stops } from "../balance";
import { balancesReply, emptyBalances, entriesReply, entry, sizeTheChart, TODAY } from "../test-balance";
import { BalanceSheet } from "./BalanceSheet";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
  sizeTheChart();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const STOPS = stops("2026-11-05");
const FAILED = () => ({ status: 500, body: { detail: "Something went wrong." } });

/** Each day's reply: cash and owner's equity both move by the stop's place, so every day balances and differs. */
function dayRoutes(today = "2026-11-05") {
  return Object.fromEntries(
    stops(today).map((stop, place) => [
      `GET /books/balances?on=${stop.day}`,
      balancesReply(stop.day, {
        cash: String(6230000 + place * 10000),
        owners_equity: String(4000000 + place * 10000),
      }),
    ]),
  );
}

function show(routes: Record<string, unknown> = dayRoutes()) {
  const calls = mockApi(routes);
  const view = renderApp(<BalanceSheet />);
  return { calls, ...view };
}

const slider = () => screen.getByRole("slider", { name: "Date" }) as HTMLInputElement;
const cash = () => screen.getByRole("button", { name: /^Cash: / }).textContent;
const reads = (calls: Call[]) => calls.map((call) => call.path.replace("/books/balances?on=", ""));

describe("the Balance sheet page", () => {
  it("opens on today with the title, the day written out and the figures", async () => {
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "Balance sheet" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Nov 5, 2026" })).toBeTruthy();
    expect(slider().value).toBe("11");
    await waitFor(() => expect(cash()).toBe("$63,400.00"));
    expect(screen.getByText("The two sides are equal.")).toBeTruthy();
  });

  it("shows only the names while the first read is on its way", () => {
    show();
    expect(screen.getByText("Cash")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Cash/ })).toBeNull();
  });

  it("redraws the figures for the day the slider moves to, and keeps balanced", async () => {
    show();
    await waitFor(() => expect(cash()).toBe("$63,400.00"));
    fireEvent.keyDown(slider(), { key: "Home" });
    expect(screen.getByRole("heading", { name: "Dec 31, 2025" })).toBeTruthy();
    await waitFor(() => expect(cash()).toBe("$62,300.00"));
    expect(screen.getByText("The two sides are equal.")).toBeTruthy();
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(screen.getByRole("heading", { name: "Jan 31, 2026" })).toBeTruthy();
    await waitFor(() => expect(cash()).toBe("$62,400.00"));
  });

  it("reads the other eleven days once the first is shown, and each day once", async () => {
    const { calls } = show();
    await waitFor(() => expect(calls).toHaveLength(12));
    expect([...reads(calls)].sort()).toEqual(STOPS.map((stop) => stop.day).sort());
    expect(reads(calls)[0]).toBe("2026-11-05");
    fireEvent.keyDown(slider(), { key: "Home" });
    fireEvent.keyDown(slider(), { key: "End" });
    await waitFor(() => expect(cash()).toBe("$63,400.00"));
    expect(calls).toHaveLength(12);
  });

  it("reads only the balances before a figure is opened", async () => {
    const { calls } = show();
    await waitFor(() => expect(calls).toHaveLength(12));
    expect(calls.every((call) => call.path.startsWith("/books/balances?on="))).toBe(true);
  });

  it("keeps the day before's figures while a day not yet read is on its way", async () => {
    const routes = dayRoutes();
    const answer = Object.entries(routes);
    mockApi(Object.fromEntries(answer.filter(([key]) => key.endsWith("2026-11-05"))));
    const base = globalThis.fetch;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("on=2026-10-31")) {
        await held;
        return new Response(JSON.stringify(routes["GET /books/balances?on=2026-10-31"]), {
          headers: { "content-type": "application/json" },
        });
      }
      return base(url, init);
    });
    renderApp(<BalanceSheet />);
    await waitFor(() => expect(cash()).toBe("$63,400.00"));
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { name: "Oct 31, 2026" })).toBeTruthy();
    expect(cash()).toBe("$63,400.00");
    expect(screen.getByText("The two sides are equal.")).toBeTruthy();
    await act(async () => release());
    await waitFor(() => expect(cash()).toBe("$63,300.00"));
  });

  it("shows $0.00, empty bars and the equal mark on a day before any entry", async () => {
    const routes = { ...dayRoutes(), "GET /books/balances?on=2025-12-31": emptyBalances("2025-12-31") };
    show(routes);
    await waitFor(() => expect(cash()).toBe("$63,400.00"));
    fireEvent.keyDown(slider(), { key: "Home" });
    await waitFor(() => expect(cash()).toBe("$0.00"));
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(Array(6).fill("$0.00"));
    expect(screen.getByText("Nothing in the books by this date.")).toBeTruthy();
    expect(screen.getByText("The two sides are equal.")).toBeTruthy();
  });

  it("says plainly when the sides differ", async () => {
    const day = "2026-11-05";
    show({ ...dayRoutes(), [`GET /books/balances?on=${day}`]: balancesReply(day, { cash: "6242000" }) });
    expect(await screen.findByText("Out of balance")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("$120.00 more");
  });

  it("fails with Couldn't load this and Try again in the place of the bars, and the slider still works", async () => {
    const routes = { ...dayRoutes(), "GET /books/balances?on=2026-11-05": FAILED };
    show(routes);
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Cash/ })).toBeNull();
    expect(slider()).toBeTruthy();
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    await waitFor(() => expect(cash()).toBe("$63,300.00"));
    expect(screen.queryByText("Couldn't load this.")).toBeNull();
  });

  it("says figures may be out of date when a refresh fails with figures showing", async () => {
    const routes = dayRoutes();
    const { client } = show(routes);
    await waitFor(() => expect(cash()).toBe("$63,400.00"));
    mockApi({ ...routes, "GET /books/balances?on=2026-11-05": FAILED });
    void client.invalidateQueries({ queryKey: ["books"] });
    expect(await screen.findByText("Couldn't refresh this, so it may be out of date.")).toBeTruthy();
    expect(cash()).toBe("$63,400.00");
  });

  it("moves the stops with the day and keeps its place counted from today", async () => {
    show({ ...dayRoutes("2026-11-05"), ...dayRoutes("2026-11-06") });
    await waitFor(() => expect(cash()).toBe("$63,400.00"));
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { name: "Oct 31, 2026" })).toBeTruthy();
    vi.setSystemTime(new Date(2026, 10, 6, 12));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(slider().value).toBe("10");
    expect(screen.getByRole("heading", { name: "Oct 31, 2026" })).toBeTruthy();
    await waitFor(() => expect(cash()).toBe("$63,300.00"));
  });

  it("opens the entries behind a figure up to the day, and gives focus back to it on close", async () => {
    const path = "/books/entries?account=cash&to=2026-11-05&limit=100&offset=0";
    const { calls } = show({
      ...dayRoutes(),
      [`GET ${path}`]: entriesReply([entry(1, { event: "payment_recorded" })]),
    });
    await waitFor(() => expect(cash()).toBe("$63,400.00"));
    const figure = screen.getByRole("button", { name: /^Cash: / });
    await user().click(figure);
    const dialog = await screen.findByRole("dialog", { name: "Cash up to Nov 5, 2026" });
    expect(await within(dialog).findByRole("link", { name: "Payment recorded" })).toBeTruthy();
    expect(calls.some((call) => call.path === path)).toBe(true);
    await user().click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(figure);
  });

  it("opens a figure of the day it was opened on, so the dialog's title and figure agree", async () => {
    show({ ...dayRoutes(), "GET /books/entries?account=cash&to=2026-10-31&limit=100&offset=0": entriesReply([]) });
    await waitFor(() => expect(cash()).toBe("$63,400.00"));
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    await waitFor(() => expect(cash()).toBe("$63,300.00"));
    await user().click(screen.getByRole("button", { name: /^Cash: / }));
    const dialog = await screen.findByRole("dialog", { name: "Cash up to Oct 31, 2026" });
    expect(within(dialog).getByText("$63,300.00")).toBeTruthy();
  });
});
