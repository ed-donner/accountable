import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user } from "../../test-utils";
import type { Dashboard as Figures, FollowUp, TimelineEntry } from "../queries";
import { Dashboard } from "./Dashboard";

const TODAY = "2026-10-31";
const WON_DEALS = "/deals?stage=won&sort=close_date&dir=desc";

const MONTH_NAMES = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];

function months(revenue: number[], deals: number[]): Figures["months"] {
  return MONTH_NAMES.map((label, index) => ({
    month: `m${index}`,
    label,
    revenue: revenue[index],
    deals: deals[index],
  }));
}

const SAM = { kind: "contact", id: 4, name: "Sam Carter" } as const;
const SUPPORT = { kind: "deal", id: 7, name: "Annual support" } as const;

function followUp(id: number, description: string, follow_up_date: string, extra: Partial<FollowUp> = {}): FollowUp {
  return { id, description, follow_up_date, overdue: follow_up_date < TODAY, about: SUPPORT, ...extra };
}

const CALL_SAM = followUp(5, "Call Sam back", "2026-10-22", { about: SAM });
const SEND_CONTRACT = followUp(6, "Send the contract", TODAY);
const CHECK_IN = followUp(8, "Check in after the launch", "2026-11-09");

function entry(id: number, description: string, extra: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    kind: "activity",
    id,
    at: "2026-10-30T15:20:00Z",
    type: "email",
    description,
    follow_up_date: null,
    follow_up_done: false,
    about: SAM,
    created_by: null,
    ...extra,
  };
}

/** A month with known answers: $42,000 won from two deals, against $7,000 from one in September. */
function figures(extra: Partial<Figures> = {}): Figures {
  return {
    today: TODAY,
    overdue_follow_ups: 1,
    late_deals: 2,
    revenue_this_month: 42000,
    revenue_last_month: 7000,
    deals_won_this_month: 2,
    deals_won_last_month: 1,
    open_pipeline: 10000,
    open_deals: 4,
    expected_revenue: 3650,
    expected_share: 37,
    months: months([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7000, 42000], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2]),
    band: [
      { stage: "new", value: 1000, count: 1 },
      { stage: "qualified", value: 0, count: 0 },
      { stage: "proposal", value: 9000, count: 2 },
      { stage: "negotiation", value: 0, count: 0 },
    ],
    funnel: [
      { stage: "new", value: 68000, carried: null },
      { stage: "qualified", value: 58000, carried: 85 },
      { stage: "proposal", value: 58000, carried: 100 },
      { stage: "negotiation", value: 49000, carried: 84 },
      { stage: "won", value: 49000, carried: 100 },
    ],
    follow_ups: { overdue: 1, upcoming: 2, items: [CALL_SAM, SEND_CONTRACT, CHECK_IN] },
    recent: [
      entry(1, "Sent the proposal"),
      entry(2, "Moved from Proposal to Negotiation", { kind: "stage_change", type: null, about: SUPPORT }),
    ],
    ...extra,
  };
}

const NOTHING_YET = figures({
  overdue_follow_ups: 0,
  late_deals: 0,
  revenue_this_month: 0,
  revenue_last_month: 0,
  deals_won_this_month: 0,
  deals_won_last_month: 0,
  open_pipeline: 0,
  open_deals: 0,
  expected_revenue: 0,
  expected_share: 0,
  months: months(Array(12).fill(0), Array(12).fill(0)),
  band: (["new", "qualified", "proposal", "negotiation"] as const).map((stage) => ({ stage, value: 0, count: 0 })),
  funnel: (["new", "qualified", "proposal", "negotiation", "won"] as const).map((stage) => ({
    stage,
    value: 0,
    carried: null,
  })),
  follow_ups: { overdue: 0, upcoming: 0, items: [] },
  recent: [],
});

const SERVER_ERROR = { status: 500, body: { detail: "Something went wrong." } };

beforeEach(() => {
  // Only the date is fixed, so the figures are for today and aren't read again for a new day.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 12, 0) });
});

afterEach(() => {
  vi.useRealTimers();
});

function show(dashboard: Figures | (() => { status?: number; body: unknown }), routes: Record<string, unknown> = {}) {
  const calls = mockApi({ "GET /dashboard": dashboard, ...routes });
  const view = renderApp(<Dashboard />);
  return { calls, ...view };
}

function region(name: string) {
  return within(screen.getByRole("region", { name }));
}

/** A stage's block in the pipeline band, line by line. */
function stageInBand(stage: string) {
  return Array.from(screen.getByTestId(`band-${stage}`).children, (line) => line.textContent);
}

async function figuresShown() {
  await screen.findByText("1 follow-up overdue and 2 deals running late.");
}

describe("the summary line", () => {
  it.each([
    [0, 0, "No follow-ups overdue and no deals running late."],
    [1, 1, "1 follow-up overdue and 1 deal running late."],
    [6, 5, "6 follow-ups overdue and 5 deals running late."],
  ])("reads right for %i overdue follow-ups and %i late deals", async (overdue, late, line) => {
    show(figures({ overdue_follow_ups: overdue, late_deals: late }));
    expect(await screen.findByText(line)).toBeTruthy();
  });
});

describe("the headline figures", () => {
  it("shows revenue won this month beside last month's, linking to the won deals", async () => {
    show(figures());
    await figuresShown();
    const link = region("Revenue won").getByRole("link", { name: /^Revenue won in October/ });
    expect(link.getAttribute("href")).toBe(WON_DEALS);
    expect(within(link).getByText("$42,000")).toBeTruthy();
    expect(within(link).getByText("September $7,000")).toBeTruthy();
  });

  it("shows deals won this month beside last month's, linking to the won deals", async () => {
    show(figures());
    await figuresShown();
    const deals = region("Deals won");
    expect(deals.getByRole("link", { name: "Deals won in October" }).getAttribute("href")).toBe(WON_DEALS);
    expect(deals.getByTestId("deals-this-month").textContent).toBe("2");
    expect(deals.getByTestId("deals-last-month").textContent).toBe("September 1");
  });

  it("shows the open pipeline and expected revenue, each linking to the Pipeline", async () => {
    show(figures());
    await figuresShown();
    const pipeline = region("Open pipeline");
    const open = pipeline.getByRole("link", { name: /^Open pipeline/ });
    const expected = pipeline.getByRole("link", { name: /^Expected revenue/ });
    expect(open.getAttribute("href")).toBe("/pipeline");
    expect(within(open).getByText("$10,000")).toBeTruthy();
    expect(within(open).getByText("4 open deals")).toBeTruthy();
    expect(expected.getAttribute("href")).toBe("/pipeline");
    expect(within(expected).getByText("$3,650")).toBeTruthy();
    expect(within(expected).getByText("37% of open pipeline")).toBeTruthy();
  });

  it("names last month right across the turn of the year", async () => {
    vi.setSystemTime(new Date(2026, 0, 31, 12, 0));
    show(figures({ today: "2026-01-31" }));
    expect(await screen.findByRole("link", { name: "Deals won in January" })).toBeTruthy();
    expect(region("Deals won").getByTestId("deals-last-month").textContent).toBe("December 1");
  });
});

describe("the pipeline band", () => {
  it("shows each open stage's value and deal count, and opens the Pipeline", async () => {
    show(figures());
    const band = await screen.findByRole("link", { name: "Open the pipeline" });
    expect(band.getAttribute("href")).toBe("/pipeline");
    expect(stageInBand("new")).toEqual(["New", "$1,000", "1 deal"]);
    expect(stageInBand("qualified")).toEqual(["Qualified", "$0", "0 deals"]);
    expect(stageInBand("proposal")).toEqual(["Proposal", "$9,000", "2 deals"]);
    expect(stageInBand("negotiation")).toEqual(["Negotiation", "$0", "0 deals"]);
  });
});

describe("the charts", () => {
  it("shows revenue and deals won per month, and the funnel, each described for screen readers", async () => {
    show(figures());
    await figuresShown();
    expect(
      screen.getByRole("img", {
        name: "Revenue won per month for the last 12 months, ending at $42,000 so far this month",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Deals won per month for the last 12 months, with 2 so far this month" }),
    ).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Sales funnel, value reaching each stage: New \$68,000/ })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Revenue and deals won per month" })).toBeTruthy();
  });
});

describe("follow-ups", () => {
  function rows() {
    return screen.getAllByTestId("follow-up").map((row) => within(row));
  }

  it("lists each one with its date and a link to what it's about, marking the overdue ones", async () => {
    show(figures());
    await figuresShown();
    expect(region("Follow-ups").getByText("1 overdue, 2 upcoming")).toBeTruthy();

    const [late, today, later] = rows();
    expect(late.getByText("Call Sam back")).toBeTruthy();
    expect(late.getByText("Overdue")).toBeTruthy();
    expect(late.getByText("Oct 22")).toBeTruthy();
    expect(late.getByRole("link", { name: "Sam Carter" }).getAttribute("href")).toBe("/contacts/4");

    expect(today.getByText("Today")).toBeTruthy();
    expect(today.queryByText("Overdue")).toBeNull();
    expect(today.getByRole("link", { name: "Annual support" }).getAttribute("href")).toBe("/deals/7");

    expect(later.getByText("Nov 9")).toBeTruthy();
    expect(later.queryByText("Overdue")).toBeNull();
  });

  it("takes a follow-up off the list once it's ticked done", async () => {
    let dashboard = figures();
    const { calls } = show(() => ({ body: dashboard }), { "PATCH /activities/5": { id: 5 } });
    await figuresShown();

    dashboard = figures({ follow_ups: { overdue: 0, upcoming: 2, items: [SEND_CONTRACT, CHECK_IN] } });
    await user().click(screen.getByRole("checkbox", { name: "Mark Call Sam back done" }));

    await waitFor(() => expect(screen.queryByText("Call Sam back")).toBeNull());
    expect(calls).toContainEqual({ method: "PATCH", path: "/activities/5", body: { follow_up_done: true } });
    expect(await region("Follow-ups").findByText("0 overdue, 2 upcoming")).toBeTruthy();
  });
});

describe("recent activity", () => {
  it("lists what happened, each with when and a link to its contact or deal", async () => {
    show(figures());
    await figuresShown();
    const [email, stageChange] = screen.getAllByTestId("recent-entry").map((row) => within(row));

    expect(email.getByText("Sent the proposal")).toBeTruthy();
    expect(email.getByText(/Oct 30, \d+:20 [AP]M/)).toBeTruthy();
    expect(email.getByRole("link", { name: "Sam Carter" }).getAttribute("href")).toBe("/contacts/4");

    expect(stageChange.getByText("Moved from Proposal to Negotiation")).toBeTruthy();
    expect(stageChange.getByRole("link", { name: "Annual support" }).getAttribute("href")).toBe("/deals/7");
  });
});

describe("with nothing in it yet", () => {
  it("shows a designed empty state in every chart and list", async () => {
    show(NOTHING_YET);
    expect(await screen.findByText("No follow-ups overdue and no deals running late.")).toBeTruthy();
    expect(region("Revenue won").getByText("Revenue will show here once you've won a deal.")).toBeTruthy();
    expect(region("Deals won").getByText("Wins will show here month by month.")).toBeTruthy();
    expect(region("Sales funnel").getByText("Deals will show here once you've added some.")).toBeTruthy();
    expect(region("Follow-ups").getByText("No follow-ups due.")).toBeTruthy();
    expect(region("Recent activity").getByText("Nothing has happened yet.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows zeros for the figures and every open stage, and never divides by zero", async () => {
    show(NOTHING_YET);
    await screen.findByText("No follow-ups overdue and no deals running late.");
    expect(region("Revenue won").getByTestId("revenue-this-month").textContent).toBe("$0");
    expect(region("Open pipeline").getByText("0 open deals")).toBeTruthy();
    expect(region("Open pipeline").getByText("0% of open pipeline")).toBeTruthy();
    expect(stageInBand("new")).toEqual(["New", "$0", "0 deals"]);
    expect(stageInBand("negotiation")).toEqual(["Negotiation", "$0", "0 deals"]);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });
});

describe("when the figures can't be read", () => {
  it("says so instead of showing figures, and reads them again on Try again", async () => {
    let reads = 0;
    show(() => {
      reads += 1;
      return reads === 1 ? SERVER_ERROR : { body: figures() };
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load this.");
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();
    expect(screen.queryByRole("region")).toBeNull();

    await user().click(within(alert).getByRole("button", { name: "Try again" }));

    await figuresShown();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the figures it has when a later read fails, and says they may be out of date", async () => {
    let failing = false;
    const { client } = show(() => (failing ? SERVER_ERROR : { body: figures() }));
    await figuresShown();

    failing = true;
    await act(() => client.refetchQueries({ queryKey: ["dashboard"] }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't refresh this, so it may be out of date.");
    expect(region("Revenue won").getByTestId("revenue-this-month").textContent).toBe("$42,000");
  });
});
