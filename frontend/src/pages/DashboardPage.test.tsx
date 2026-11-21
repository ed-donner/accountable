import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "@/App";
import { META, dashboard, fakeApi, renderWithApp, reply } from "@/test/render";

describe("the dashboard", () => {
  it("shows the date and the headline figures (DASH-1, DASH-2)", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/dashboard": dashboard() });
    renderWithApp(<App />, { route: "/" });

    expect(await screen.findByText("Thursday, November 19")).toBeInTheDocument();
    expect(screen.getByText("$1,011,000")).toBeInTheDocument();
    expect(screen.getByText("18 open deals")).toBeInTheDocument();
    expect(screen.getByText("$502,300")).toBeInTheDocument();
    expect(screen.getByText("Won this month")).toBeInTheDocument();
    expect(screen.getByText(/due in the next 7 days/)).toHaveTextContent("3 due in the next 7 days");
  });

  it("breaks the open pipeline down by stage, and shows the funnel (DASH-5, DASH-6)", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/dashboard": dashboard() });
    renderWithApp(<App />, { route: "/" });

    const strip = await screen.findByRole("list", { name: "Open pipeline by stage" });
    expect(within(strip).getAllByRole("listitem")).toHaveLength(4);
    const funnel = screen.getByRole("list", { name: "Sales funnel" });
    expect(within(funnel).getByText("Won")).toBeInTheDocument();
  });

  it("sums up both charts in words for screen readers (DASH-3, DASH-4)", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/dashboard": dashboard() });
    renderWithApp(<App />, { route: "/" });

    expect(
      await screen.findByText("Revenue won over the last 12 months: $48,500. Highest in November: $48,500."),
    ).toBeInTheDocument();
    expect(screen.getByText("Deals won over the last 12 months: 1. Most in November: 1.")).toBeInTheDocument();
  });

  it("lists follow-ups with how late they are, and ticks one off (DASH-7)", async () => {
    const { calls } = fakeApi({
      "GET /api/meta": META,
      "GET /api/dashboard": dashboard(),
      "PATCH /api/activities/7": {},
    });
    const { user } = renderWithApp(<App />, { route: "/" });

    const followUps = await screen.findByRole("list", { name: "Follow-ups" });
    expect(within(followUps).getByText("Send the proposal")).toBeInTheDocument();
    expect(within(followUps).getByText("2 days late")).toBeInTheDocument();
    expect(within(followUps).getByRole("link", { name: "Sarah Chen" })).toHaveAttribute("href", "/contacts/10");

    const done = within(followUps).getByRole("checkbox", { name: "Done: Send the proposal" });
    await user.click(done);
    expect(done).toBeChecked();
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "PATCH", path: "/api/activities/7", body: { done: true } }),
    );
  });

  it("unticks a follow-up if saving it fails", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/dashboard": dashboard(), "PATCH /api/activities/7": reply(500) });
    const { user } = renderWithApp(<App />, { route: "/" });
    const done = await screen.findByRole("checkbox", { name: "Done: Send the proposal" });
    await user.click(done);
    expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument();
    expect(done).not.toBeChecked();
  });

  it("shows recent activity, and says when there's nothing to show (DASH-8)", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/dashboard": dashboard() });
    renderWithApp(<App />, { route: "/" });
    const recent = await screen.findByRole("list", { name: "Recent activity" });
    expect(within(recent).getByText("Kickoff call booked")).toBeInTheDocument();
  });

  it("says when there are no follow-ups or activities", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/dashboard": dashboard({ follow_ups: [], recent: [] }) });
    renderWithApp(<App />, { route: "/" });
    expect(await screen.findByText("Nothing due in the next 7 days.")).toBeInTheDocument();
    expect(screen.getByText("Nothing logged yet.")).toBeInTheDocument();
  });

  it("says when it couldn't load", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/dashboard": reply(500) });
    renderWithApp(<App />, { route: "/" });
    expect(await screen.findByText(/Couldn't load this page/)).toBeInTheDocument();
  });
});
