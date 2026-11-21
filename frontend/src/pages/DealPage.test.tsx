import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "@/App";
import { META, deal, entry, fakeApi, renderWithApp, reply } from "@/test/render";

function routes(extra: Record<string, unknown> = {}) {
  return {
    "GET /api/meta": META,
    "GET /api/deals/100": deal(),
    "GET /api/deals/100/timeline": [entry({ deal: { id: 100, name: "Website redesign" } })],
    ...extra,
  };
}

describe("a deal's page", () => {
  it("shows the deal's figures, links and timeline (DEAL-4)", async () => {
    fakeApi(routes());
    renderWithApp(<App />, { route: "/deals/100" });

    expect(await screen.findByRole("heading", { name: "Website redesign", level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Bluefin Logistics" })[0]).toHaveAttribute("href", "/organizations/1");
    expect(screen.getAllByRole("link", { name: "Sarah Chen" })[0]).toHaveAttribute("href", "/contacts/10");
    expect(screen.getByText("$48,500")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("$12,125")).toBeInTheDocument();
    expect(screen.getByText("Dec 12, 2026")).toBeInTheDocument();

    const timeline = await screen.findByRole("list", { name: "Timeline entries" });
    // On a deal's own timeline, entries don't name the deal again.
    expect(within(timeline).queryByRole("link", { name: "Website redesign" })).not.toBeInTheDocument();
  });

  it("marks the current stage and moves the deal from the stage bar (DEAL-5)", async () => {
    const { calls } = fakeApi(routes({ "PATCH /api/deals/100": deal({ stage: "proposal" }) }));
    const { user } = renderWithApp(<App />, { route: "/deals/100" });
    const stages = await screen.findByRole("navigation", { name: "Stage" });
    expect(within(stages).getByRole("button", { name: "Qualified, the current stage" })).toHaveAttribute(
      "aria-current",
      "step",
    );

    await user.click(within(stages).getByRole("button", { name: "Move to Proposal" }));
    expect(await screen.findByText("Deal moved to Proposal")).toBeInTheDocument();
    expect(calls).toContainEqual({ method: "PATCH", path: "/api/deals/100", body: { stage: "proposal" } });
  });

  it("says when a move from the stage bar fails", async () => {
    fakeApi(routes({ "PATCH /api/deals/100": reply(500) }));
    const { user } = renderWithApp(<App />, { route: "/deals/100" });
    await user.click(await screen.findByRole("button", { name: "Move to Won" }));
    expect(await screen.findByText("Couldn't move the deal. Try again.")).toBeInTheDocument();
  });

  it("marks a late deal", async () => {
    fakeApi(routes({ "GET /api/deals/100": deal({ is_late: true, close_date: "2026-11-01" }) }));
    renderWithApp(<App />, { route: "/deals/100" });
    await screen.findByRole("heading", { name: "Website redesign", level: 1 });
    expect(screen.getAllByText("Late")).toHaveLength(2);
  });

  it("opens the deal's form from Edit", async () => {
    fakeApi(routes({ "GET /api/organizations": [], "GET /api/contacts": [] }));
    const { user } = renderWithApp(<App />, { route: "/deals/100" });
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const form = await screen.findByRole("dialog", { name: "Edit Website redesign" });
    expect(within(form).getByRole("textbox", { name: /Name/ })).toHaveValue("Website redesign");
  });

  it("says when the deal no longer exists", async () => {
    fakeApi({ "GET /api/meta": META });
    renderWithApp(<App />, { route: "/deals/100" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "This deal no longer exists." })).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "Go to deals" })).toHaveAttribute("href", "/deals");
  });

  it("says when the page couldn't load", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/deals/100": reply(500) });
    renderWithApp(<App />, { route: "/deals/100" });
    expect(await screen.findByText(/Couldn't load this page/)).toBeInTheDocument();
  });
});
