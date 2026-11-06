import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user, type Call } from "../test-utils";
import { CashFlowRow } from "./CashFlowRow";
import { TODAY, cashFlowReply, quietMonths, sizeTheChart } from "./test-cash-flow";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
  sizeTheChart();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const FAILED = { status: 500, body: { detail: "Something went wrong." } };

function show(reply: unknown) {
  const calls = mockApi({ "GET /cash-flow": reply });
  const view = renderApp(<CashFlowRow />);
  return { calls, ...view };
}

function row() {
  return within(screen.getByRole("region", { name: "Cash flow" }));
}

function reads(calls: Call[]) {
  return calls.filter((call) => call.path === "/cash-flow").length;
}

/** A figure's label, amount and what's under it, as one line. */
function figure(label: string) {
  return row().getByText(label).parentElement?.textContent;
}

function legend() {
  return [...row().getByRole("list", { name: "Legend" }).querySelectorAll("li")].map((entry) => entry.textContent);
}

describe("the cash flow's figures", () => {
  it("gives cash today and the balance expected at the end of the third forecast month", async () => {
    show(cashFlowReply());
    expect(await row().findByText("Cash today")).toBeTruthy();
    expect(figure("Cash today")).toBe("Cash today$66,600.00");
    expect(figure("End of February")).toBe("End of February$72,100.00Expected");
    expect(row().queryByText("With likely deals")).toBeNull();
  });

  it("shows a balance below zero with its minus sign before the currency", async () => {
    show(cashFlowReply({ cash_today: "-425000", forecast_end: "-1250050" }));
    await row().findByText("Cash today");
    expect(figure("Cash today")).toBe("Cash today-$4,250.00");
    expect(figure("End of February")).toBe("End of February-$12,500.50Expected");
  });

  it("shows sums past what a JavaScript number holds to the cent", async () => {
    show(cashFlowReply({ cash_today: "9200000000000001" }));
    await row().findByText("Cash today");
    expect(figure("Cash today")).toBe("Cash today$92,000,000,000,000.01");
  });
});

describe("the Likely deals switch", () => {
  it("is off each time, and turning it on adds With likely deals in the place kept for it", async () => {
    show(cashFlowReply());
    const toggle = await row().findByRole("switch", { name: "Likely deals" });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    const places = row().getByText("End of February").closest("div.grid")!.children;
    expect(places).toHaveLength(3);
    expect(places[2].textContent).toBe("");
    expect(legend()).toEqual(["Money in", "Money out", "Cash", "Forecast"]);

    await user().click(toggle);

    expect((toggle as HTMLInputElement).checked).toBe(true);
    expect(places[2].textContent).toBe("With likely deals$82,100.00");
    expect(legend()).toEqual(["Money in", "Money out", "Cash", "Forecast", "Likely deals"]);
  });

  it("draws from the same reply, without reading it again", async () => {
    const { calls } = show(cashFlowReply());
    await user().click(await row().findByRole("switch", { name: "Likely deals" }));
    await user().click(row().getByRole("switch", { name: "Likely deals" }));
    expect(reads(calls)).toBe(1);
  });
});

describe("without an opening balance", () => {
  it("says how to add one, in the figures' place, with no switch and no balance in the legend", async () => {
    show(cashFlowReply({ opening: false }));
    const message = await row().findByText(/^No opening balance yet\./);
    expect(message.textContent).toBe("No opening balance yet. Add one in Company settings to see the cash balance.");
    expect(within(message).getByRole("link", { name: "Company settings" }).getAttribute("href")).toBe("/settings");
    expect(row().queryByText("Cash today")).toBeNull();
    expect(row().queryByRole("switch")).toBeNull();
    expect(legend()).toEqual(["Money in", "Money out"]);
    expect(row().getByRole("img", { name: /^Money in and out each month/ })).toBeTruthy();
  });

  it("says the chart will show once money moves, with nothing in or out and nothing expected", async () => {
    show(cashFlowReply({ opening: false, months: quietMonths() }));
    expect(await row().findByText("Cash flow will show here once money comes in or goes out.")).toBeTruthy();
    expect(row().queryByRole("img")).toBeNull();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });

  it("still draws the chart with an opening balance and nothing yet", async () => {
    show(cashFlowReply({ months: quietMonths() }));
    expect(await row().findByRole("img", { name: /with the cash balance at each month's end$/ })).toBeTruthy();
    expect(row().queryByText("Cash flow will show here once money comes in or goes out.")).toBeNull();
  });
});

describe("reading the cash flow", () => {
  it("says so if it can't be read, and tries again", async () => {
    let reply: unknown = FAILED;
    mockApi({ "GET /cash-flow": () => (reply === FAILED ? FAILED : { body: reply }) });
    renderApp(<CashFlowRow />);
    expect(await row().findByText("Couldn't load this.")).toBeTruthy();
    expect(row().getByRole("heading", { level: 3, name: "Cash flow" })).toBeTruthy();

    reply = cashFlowReply();
    await user().click(row().getByRole("button", { name: "Try again" }));
    expect(await row().findByText("Cash today")).toBeTruthy();
    expect(row().queryByText("Couldn't load this.")).toBeNull();
  });

  it("keeps the chart when a later read fails, and says it may be out of date", async () => {
    let failing = false;
    mockApi({ "GET /cash-flow": () => (failing ? FAILED : { body: cashFlowReply() }) });
    const { client } = renderApp(<CashFlowRow />);
    await row().findByText("Cash today");

    failing = true;
    await act(() => client.refetchQueries({ queryKey: ["cash-flow"] }));
    expect(await screen.findByText("Couldn't refresh this, so it may be out of date.")).toBeTruthy();
    expect(row().getByText("Cash today")).toBeTruthy();
  });

  it("reads it again when the day changes", async () => {
    vi.setSystemTime(new Date(2026, 10, 5, 23, 59));
    const { calls } = show(cashFlowReply());
    await row().findByText("Cash today");
    vi.setSystemTime(new Date(2026, 10, 6, 0, 1));
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(reads(calls)).toBe(2));
  });
});

describe("the table behind the chart", () => {
  function table() {
    return row().getByRole("table", { name: "Cash flow for the last 12 months and the next 3" });
  }

  function cells(name: RegExp) {
    return [...within(table()).getByRole("row", { name }).querySelectorAll("th, td")].map((cell) => cell.textContent);
  }

  it("gives every month's figures for anyone who can't see the chart", async () => {
    show(cashFlowReply());
    await row().findByText("Cash today");
    expect(within(table()).getAllByRole("row")).toHaveLength(16);
    expect(cells(/^Dec 2025/)).toEqual(["Dec 2025", "$3,000.00", "$1,200.00", "$0.00", "$0.00", "$41,800.00"]);
    expect(cells(/^Nov 2026, so far/)).toEqual([
      "Nov 2026, so far",
      "$1,500.00",
      "$200.00",
      "$2,500.00",
      "$600.00",
      "$68,500.00",
    ]);
  });

  it("adds the likely deals while the switch is on, and says None where there's no balance", async () => {
    show(cashFlowReply({ months: { "2025-12": { balance_cents: null, balance_with_deals_cents: null } } }));
    await user().click(await row().findByRole("switch", { name: "Likely deals" }));
    expect(cells(/^Dec 2025/)).toEqual([
      "Dec 2025",
      "$3,000.00",
      "$1,200.00",
      "$0.00",
      "$0.00",
      "$0.00",
      "None",
      "None",
    ]);
    expect(cells(/^Feb 2027, forecast/)).toEqual([
      "Feb 2027, forecast",
      "$0.00",
      "$0.00",
      "$2,000.00",
      "$800.00",
      "$3,000.00",
      "$72,100.00",
      "$82,100.00",
    ]);
  });
});
