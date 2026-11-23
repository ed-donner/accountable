// H1 to H8: the dashboard's figures, charts and lists, and what it says when empty or failing.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Schemas } from "../shared/api";
import { longDate } from "../shared/format";
import { mockApi, renderApp } from "../shared/test-utils";
import { localToday } from "../shared/today";

afterEach(() => vi.unstubAllGlobals());

type Dashboard = Schemas["Dashboard"];

const today = localToday();

function month(month: string, won_value: number, won_count = 1, lost_count = 0) {
  return { month, won_value, won_count, lost_count };
}

function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    today,
    headline: {
      open_value: 48200,
      open_count: 3,
      expected_revenue: 21000,
      won_this_month_value: 15000,
      won_this_month_count: 2,
      follow_ups_due: 3,
      follow_ups_overdue: 2,
    },
    months: [month("2026-10", 10000, 1, 2), month("2026-11", 15000, 2, 1)],
    pipeline: [
      { stage: "new", count: 2, value: 20000, expected_revenue: 2000 },
      { stage: "proposal", count: 1, value: 0, expected_revenue: 0 },
    ],
    funnel: [
      { stage: "new", count: 4, value: 40000, share_of_previous: null },
      { stage: "qualified", count: 2, value: 20000, share_of_previous: 0.5 },
    ],
    recent: [
      {
        kind: "stage_change",
        id: 1,
        on: today,
        at: `${today}T09:30:00`,
        text: "Fleet renewal moved to Proposal",
        type: null,
        contact: null,
        deal: { id: 5, name: "Fleet renewal" },
      },
      {
        kind: "activity",
        id: 2,
        on: "2026-01-02",
        at: "2026-01-02T10:00:00",
        text: "Emailed the price list",
        type: "email",
        contact: { id: 7, name: "Ann Bolt" },
        deal: null,
      },
    ],
    follow_ups: [
      {
        id: 40,
        type: "call",
        description: "Call Ann back",
        follow_up_on: today,
        status: "upcoming",
        contact: { id: 7, name: "Ann Bolt" },
        deal: null,
      },
      {
        id: 41,
        type: "note",
        description: "Check the contract",
        follow_up_on: "2026-01-05",
        status: "overdue",
        contact: null,
        deal: null,
      },
    ],
    ...overrides,
  };
}

function headline(overrides: Partial<Dashboard["headline"]>): Dashboard["headline"] {
  return { ...dashboard().headline, ...overrides };
}

const tiles = () => screen.findByRole("region", { name: "Headline figures" });

test("the headline tiles show the figures, each linking to the answer behind it", async () => {
  mockApi({ "GET /dashboard": dashboard() });
  renderApp("/");
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  expect(screen.getByText(longDate(today))).toBeInTheDocument();
  const region = await tiles();
  const open = within(region).getByRole("link", { name: "Open pipeline: $48,200" });
  expect(open).toHaveAttribute("href", "/pipeline");
  expect(open).toHaveTextContent("3 open deals");
  const won = within(region).getByRole("link", { name: "Won this month: $15,000" });
  expect(won).toHaveAttribute("href", "/deals?stage=won");
  expect(won).toHaveTextContent("2 deals, up 50% on Oct");
  const due = within(region).getByRole("link", { name: "Follow-ups due: 3" });
  expect(due).toHaveAttribute("href", "#follow-ups");
  expect(due).toHaveTextContent("2 overdue, 1 due today");
  expect(screen.queryByText(/Welcome to Accountable/)).not.toBeInTheDocument();
});

test.each([
  [[month("2026-10", 20000), month("2026-11", 15000)], "1 deal, down 25% on Oct"],
  [[month("2026-10", 15000), month("2026-11", 15000)], "1 deal, level with Oct"],
  [[month("2026-10", 0), month("2026-11", 15000)], "1 deal"],
  [[month("2026-11", 15000)], "1 deal"],
])("the won tile compares this month with last month (%#)", async (months, note) => {
  mockApi({
    "GET /dashboard": dashboard({ months, headline: headline({ won_this_month_count: 1 }) }),
  });
  renderApp("/");
  const region = await tiles();
  expect(within(region).getByRole("link", { name: /Won this month/ })).toHaveTextContent(
    new RegExp(`${note}$`),
  );
});

test("an empty dashboard welcomes the user and says nothing is due", async () => {
  mockApi({
    "GET /dashboard": dashboard({
      headline: headline({ open_count: 0, follow_ups_due: 0, follow_ups_overdue: 0 }),
      recent: [],
      follow_ups: [],
    }),
  });
  renderApp("/");
  expect(await screen.findByText(/Welcome to Accountable/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Follow-ups due: 0" })).toHaveTextContent(
    "Nothing due today",
  );
  expect(screen.getByText(/No follow-ups overdue or due in the next 7 days/)).toBeInTheDocument();
  expect(screen.getByText(/Nothing has happened yet/)).toBeInTheDocument();
});

test("the charts describe their figures for screen readers", async () => {
  mockApi({ "GET /dashboard": dashboard() });
  renderApp("/");
  expect(
    await screen.findByRole("img", {
      name: "Revenue won per month: Oct 2026 $10,000, Nov 2026 $15,000",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("img", {
      name: "Deals won and lost per month: Oct 2026 1 won, 2 lost; Nov 2026 2 won, 1 lost",
    }),
  ).toBeInTheDocument();
});

test("the funnel and stage bars show each stage's figures", async () => {
  mockApi({ "GET /dashboard": dashboard() });
  renderApp("/");
  const funnel = await screen.findByRole("list", { name: "Sales funnel" });
  const steps = within(funnel).getAllByRole("listitem");
  expect(steps[0]).toHaveTextContent("New4 deals$40K");
  expect(steps[1]).toHaveTextContent("Qualified2 deals$20K50% of previous");
  const bars = screen.getByRole("region", { name: "Open pipeline by stage" });
  expect(
    within(bars).getByRole("link", { name: "New: 2 deals, $20,000, expected $2,000" }),
  ).toHaveAttribute("href", "/pipeline");
  expect(
    within(bars).getByRole("link", { name: "Proposal: 1 deals, $0, expected $0" }),
  ).toBeInTheDocument();
});

test("recent activity links each item to its record, with the time for today's moves", async () => {
  mockApi({ "GET /dashboard": dashboard() });
  renderApp("/");
  const recent = await screen.findByRole("region", { name: "Recent activity" });
  const [move, email] = within(recent).getAllByRole("listitem");
  expect(move).toHaveTextContent("Today, 09:30");
  expect(within(move).getByRole("link", { name: "Fleet renewal" })).toHaveAttribute(
    "href",
    "/deals/5",
  );
  expect(email).toHaveTextContent("2 Jan");
  expect(within(email).getByRole("link", { name: "Ann Bolt" })).toHaveAttribute(
    "href",
    "/contacts/7",
  );
});

test("Mark done takes a follow-up off the list and says so", async () => {
  let done = false;
  const calls = mockApi({
    "GET /dashboard": () => ({ body: dashboard(done ? { follow_ups: [] } : {}) }),
    "PATCH /activities/40": () => {
      done = true;
      return { body: { id: 40 } };
    },
  });
  renderApp("/");
  const followUps = await screen.findByRole("region", { name: "Follow-ups" });
  expect(within(followUps).getByLabelText(`Follow-up Today, due`)).toBeInTheDocument();
  expect(within(followUps).getByLabelText(/Follow-up 5 Jan, overdue/)).toBeInTheDocument();
  await userEvent.click(
    within(followUps).getByRole("button", { name: "Mark done: Call Ann back" }),
  );
  expect(await screen.findByText("Follow-up marked done.")).toBeInTheDocument();
  expect(calls).toContainEqual({ method: "PATCH", path: "/activities/40", body: { done: true } });
  await waitFor(() =>
    expect(within(followUps).getByText(/No follow-ups overdue/)).toBeInTheDocument(),
  );
});

test("a Mark done that fails says why", async () => {
  mockApi({
    "GET /dashboard": dashboard(),
    "PATCH /activities/41": () => ({ status: 404, body: { message: "That follow-up is gone." } }),
  });
  renderApp("/");
  await userEvent.click(
    await screen.findByRole("button", { name: "Mark done: Check the contract" }),
  );
  expect(
    await screen.findByText("Couldn't mark the follow-up done. That follow-up is gone."),
  ).toBeInTheDocument();
});

test("a dashboard that fails to load says so", async () => {
  mockApi({ "GET /dashboard": () => ({ status: 500, body: { message: "boom" } }) });
  renderApp("/");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /Couldn't load this dashboard\. Something went wrong in Accountable/,
  );
});
