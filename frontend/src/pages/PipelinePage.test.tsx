import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "@/App";
import type { Pipeline } from "@/api/types";
import { META, ORGS, deal, entry, fakeApi, renderWithApp, reply } from "@/test/render";

const BRAND_REFRESH = deal({
  id: 101,
  name: "Brand refresh",
  value: 20_000,
  expected_value: 5_000,
  is_late: true,
  close_date: "2026-11-01",
  main_contact: null,
});

const PIPELINE: Pipeline = {
  columns: [
    { stage: "new", deals: [] },
    { stage: "qualified", deals: [deal(), BRAND_REFRESH] },
    { stage: "proposal", deals: [] },
    { stage: "negotiation", deals: [] },
    { stage: "won", deals: [] },
    { stage: "lost", deals: [] },
  ],
};

function routes(extra: Record<string, unknown> = {}) {
  return { "GET /api/meta": META, "GET /api/pipeline": PIPELINE, ...extra };
}

describe("the pipeline", () => {
  it("shows the open pipeline in the band, and each column's figures (PIPE-1)", async () => {
    fakeApi(routes());
    renderWithApp(<App />, { route: "/pipeline" });

    expect(await screen.findByText("2 open deals, 1 of them late")).toBeInTheDocument();
    const qualified = screen.getByRole("region", { name: "Qualified" });
    expect(within(qualified).getByText("2")).toBeInTheDocument();
    expect(within(qualified).getByText("$68,500")).toBeInTheDocument();
    expect(within(qualified).getByText("$17,125")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Won" })).toHaveTextContent("Closed in the last 30 days");
  });

  it("shows each deal as a card, and says when a column is empty (PIPE-4)", async () => {
    fakeApi(routes());
    renderWithApp(<App />, { route: "/pipeline" });

    const qualified = await screen.findByRole("list", { name: "Qualified deals" });
    const cards = within(qualified).getAllByRole("button");
    expect(cards.map((card) => within(card).getByText(/redesign|refresh/).textContent)).toEqual([
      "Website redesign",
      "Brand refresh",
    ]);
    expect(within(cards[1]).getByText("Late")).toBeInTheDocument();
    expect(within(cards[1]).getByText("No main contact")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "New deals" })).toHaveTextContent("No deals here");
    expect(screen.getByRole("list", { name: "Lost deals" })).toHaveTextContent("None closed in the last 30 days");
  });

  it("opens a deal with a click or Enter (PIPE-4, PIPE-8)", async () => {
    fakeApi(
      routes({
        "GET /api/deals/100": deal(),
        "GET /api/deals/100/timeline": [entry()],
        "GET /api/deals/101": BRAND_REFRESH,
        "GET /api/deals/101/timeline": [],
      }),
    );
    const { user } = renderWithApp(<App />, { route: "/pipeline" });
    await user.click(await screen.findByRole("button", { name: /^Website redesign/ }));
    expect(await screen.findByRole("heading", { name: "Website redesign", level: 1 })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Pipeline" }));
    screen.getByRole("button", { name: /^Brand refresh/ }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Brand refresh", level: 1 })).toBeInTheDocument();
  });

  it("picks a card up with Space and puts it back with Escape, saying so (PIPE-8)", async () => {
    const { calls } = fakeApi(routes());
    const { user } = renderWithApp(<App />, { route: "/pipeline" });
    (await screen.findByRole("button", { name: /^Website redesign/ })).focus();

    await user.keyboard(" ");
    expect(await screen.findByText("Picked up Website redesign.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(await screen.findByText("Website redesign was put back where it was.")).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("adds a deal at the column's own stage (PIPE-7)", async () => {
    fakeApi(routes({ "GET /api/organizations": ORGS, "GET /api/contacts": [] }));
    const { user } = renderWithApp(<App />, { route: "/pipeline" });
    await user.click(await screen.findByRole("button", { name: "Add deal in Proposal" }));
    const form = await screen.findByRole("dialog", { name: "Add deal" });
    expect(within(form).getByRole("combobox", { name: /Stage/ })).toHaveTextContent("Proposal");
    expect(within(form).getByRole("textbox", { name: /Probability/ })).toHaveValue("50");
  });

  it("says when the pipeline couldn't load", async () => {
    fakeApi({ "GET /api/meta": META, "GET /api/pipeline": reply(500) });
    renderWithApp(<App />, { route: "/pipeline" });
    expect(await screen.findByText(/Couldn't load this page/)).toBeInTheDocument();
  });
});
