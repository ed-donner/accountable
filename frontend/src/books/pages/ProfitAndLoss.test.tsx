import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user, type Call } from "../../test-utils";
import { chartMonths, entriesReply, entry, figuresOf, pageReply, sizeTheChart, TODAY } from "../profit/test-profit";
import { EXPLANATION, ProfitAndLoss } from "./ProfitAndLoss";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
  sizeTheChart();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const MONTH = "GET /books/profit-and-loss?period=month";
const FAILED = { status: 500, body: { detail: "Something went wrong." } };

function show(routes: Record<string, unknown>) {
  const calls = mockApi(routes);
  const view = renderApp(<ProfitAndLoss />);
  return { calls, ...view };
}

function statement() {
  return within(screen.getByRole("region", { name: "Statement" }));
}

/** Waits for the statement's panel, which is there once the read has arrived, then for the text in it. */
async function findInStatement(text: string) {
  return within(await screen.findByRole("region", { name: "Statement" })).findByText(text);
}

function reads(calls: Call[]) {
  return calls.filter((call) => call.path.startsWith("/books/profit-and-loss?")).map((call) => call.path.slice(22));
}

describe("the page", () => {
  it("has its title, the line explaining that profit isn't cash, and two panels", async () => {
    show({ [MONTH]: pageReply() });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Profit and loss");
    expect(screen.getByText(EXPLANATION)).toBeTruthy();
    expect(EXPLANATION).toBe(
      "Revenue counts on the day an invoice is issued and expenses on the bill date, so profit isn't the same as cash.",
    );
    expect(await findInStatement("November 2026")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Last 12 months" })).toBeTruthy();
    expect(document.title).toBe("Profit and loss | Accountable");
  });

  it("opens on the current month in one read, for the chart and the statement", async () => {
    const { calls } = show({ [MONTH]: pageReply() });
    expect(await findInStatement("so far")).toBeTruthy();
    expect(statement().getByRole("button", { name: "Month", pressed: true })).toBeTruthy();
    expect(reads(calls)).toEqual(["?period=month"]);
    expect(statement().getByText("Change from October 2026")).toBeTruthy();
  });

  it("draws the legend and the chart from the same read", async () => {
    show({ [MONTH]: pageReply() });
    const legend = await screen.findByRole("list", { name: "Legend" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Revenue", "Profit", "Software", "Contractors", "Travel", "Office", "Marketing", "Other"]);
    await waitFor(() => expect(document.querySelectorAll("path.recharts-rectangle").length).toBeGreaterThan(0));
  });

  it("says what the chart will show when there is nothing in the 12 months", async () => {
    const empty = chartMonths(Object.fromEntries(chartMonths().map((month) => [month.month, figuresOf(0)])));
    show({ [MONTH]: pageReply({ months: empty }) });
    expect(
      await screen.findByText("The chart will show here once you've issued an invoice or added a bill."),
    ).toBeTruthy();
    expect(statement().getAllByText("$0.00").length).toBeGreaterThan(0);
  });
});

describe("the period", () => {
  it("is switched with the day kept, and the arrows send the backend's days", async () => {
    const quarter = pageReply({ period: { kind: "quarter", label: "Q4 2026", back_on: "2026-07-01" } });
    const earlier = pageReply({
      period: { kind: "month", label: "October 2026", current: false, forward_on: "2026-11-01" },
    });
    const { calls } = show({
      [MONTH]: pageReply(),
      "GET /books/profit-and-loss?period=quarter": quarter,
      "GET /books/profit-and-loss?period=month&on=2026-10-01": earlier,
      "GET /books/profit-and-loss?period=quarter&on=2026-10-01": quarter,
    });
    await findInStatement("November 2026");
    const clicks = user();

    await clicks.click(statement().getByRole("button", { name: "Earlier period" }));
    expect(await findInStatement("October 2026")).toBeTruthy();
    expect(statement().queryByText("so far")).toBeNull();

    await clicks.click(statement().getByRole("button", { name: "Quarter" }));
    expect(await findInStatement("Q4 2026")).toBeTruthy();
    expect(reads(calls)).toEqual(["?period=month", "?period=month&on=2026-10-01", "?period=quarter&on=2026-10-01"]);
  });

  it("keeps the old statement showing, dimmed, until the new one arrives", async () => {
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => (release = resolve));
    show({ [MONTH]: pageReply() });
    await findInStatement("November 2026");
    const year = pageReply({ period: { kind: "year", label: "2026", current: true } });
    mockYear(year, held);

    await user().click(statement().getByRole("button", { name: "Year" }));

    expect(screen.getByRole("region", { name: "Statement" }).className).toContain("opacity-60");
    expect(statement().getByText("November 2026")).toBeTruthy();
    release();
    expect(await findInStatement("2026")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Statement" }).className).not.toContain("opacity-60");
  });

  it("does not let a late reply for an earlier choice replace a later one", async () => {
    let releaseQuarter = () => undefined as void;
    const held = new Promise<void>((resolve) => (releaseQuarter = resolve));
    const quarter = pageReply({ period: { kind: "quarter", label: "Q4 2026" } });
    const year = pageReply({ period: { kind: "year", label: "2026" } });
    mockApi({
      [MONTH]: pageReply(),
      "GET /books/profit-and-loss?period=quarter": quarter,
      "GET /books/profit-and-loss?period=year": year,
    });
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("period=quarter")) await held;
      return answer(url, init);
    });
    renderApp(<ProfitAndLoss />);
    await findInStatement("November 2026");
    const clicks = user();

    await clicks.click(statement().getByRole("button", { name: "Quarter" }));
    await clicks.click(statement().getByRole("button", { name: "Year" }));
    expect(await findInStatement("2026")).toBeTruthy();
    releaseQuarter();
    await act(async () => {
      await held;
    });

    expect(statement().getByText("2026")).toBeTruthy();
    expect(statement().queryByText("Q4 2026")).toBeNull();
    expect(statement().getByRole("button", { name: "Year", pressed: true })).toBeTruthy();
  });

  it("reads again when the day changes", async () => {
    const { calls } = show({ [MONTH]: pageReply() });
    await findInStatement("November 2026");
    vi.setSystemTime(new Date(2026, 10, 6, 0, 1));
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(reads(calls)).toHaveLength(2));
  });
});

function mockYear(year: unknown, held: Promise<void>) {
  const answer = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.includes("period=year")) {
      await held;
      return new Response(JSON.stringify(year), { status: 200, headers: { "content-type": "application/json" } });
    }
    return answer(url, init);
  });
}

describe("a read that fails", () => {
  it("says so once, in place of the chart and the statement, with Try again", async () => {
    let tries = 0;
    show({ [MONTH]: () => (++tries === 1 ? FAILED : { body: pageReply() }) });
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();

    await user().click(screen.getByRole("button", { name: "Try again" }));

    expect(await findInStatement("November 2026")).toBeTruthy();
    expect(screen.queryByText("Couldn't load this.")).toBeNull();
  });

  it("keeps what is showing and says it may be out of date when a later read fails", async () => {
    let failing = false;
    const { client } = show({ [MONTH]: () => (failing ? FAILED : { body: pageReply() }) });
    await findInStatement("November 2026");

    failing = true;
    await act(() => client.refetchQueries({ queryKey: ["profit-and-loss"] }));

    expect(await screen.findByText("Couldn't refresh this, so it may be out of date.")).toBeTruthy();
    expect(statement().getByText("November 2026")).toBeTruthy();
  });
});

describe("the entries behind a figure", () => {
  const REVENUE = "GET /books/profit-and-loss/entries?figure=revenue&from=2026-11-01&to=2026-11-30&limit=100&offset=0";

  it("open from a statement amount, titled with the period, and focus returns to the amount after Close", async () => {
    show({ [MONTH]: pageReply(), [REVENUE]: entriesReply("revenue", [entry(1)]) });
    await findInStatement("November 2026");
    const amount = statement().getByRole("button", { name: /^Revenue, / });

    await user().click(amount);

    expect(await screen.findByRole("dialog", { name: "Revenue, November 2026" })).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(amount);
  });

  it("open from the chart's table for a month, and focus returns to that button", async () => {
    const MARCH = "GET /books/profit-and-loss/entries?figure=profit&from=2026-03-01&to=2026-03-31&limit=100&offset=0";
    show({ [MONTH]: pageReply(), [MARCH]: entriesReply("profit", [entry(2)]) });
    await findInStatement("November 2026");
    const button = await screen.findByRole("button", { name: /^Profit, March 2026/ });

    await user().click(button);

    expect(await screen.findByRole("dialog", { name: "Profit, March 2026" })).toBeTruthy();
    await user().keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
});
