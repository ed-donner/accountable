import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { queryDefaults } from "../../lib/queryDefaults";
import { META, mockApi, user } from "../../test-utils";
import type { Deal } from "../queries";
import { Deals } from "./Deals";

function deal(id: number, name: string, extra: Partial<Deal>): Deal {
  return {
    id,
    name,
    organization_id: 1,
    organization_name: "Harbor & Pine",
    main_contact_id: 11,
    main_contact_name: "Sam Carter",
    stage: "new",
    value: 1000,
    probability: 5,
    expected_revenue: 50,
    close_date: "2999-01-01",
    position: 0,
    ...extra,
  };
}

const SUPPORT = deal(5, "Annual support", {
  stage: "proposal",
  value: 36000,
  probability: 40,
  expected_revenue: 14400,
  close_date: "2999-12-18",
});
const PILOT = deal(6, "Pilot", {
  organization_id: null,
  organization_name: null,
  main_contact_id: null,
  main_contact_name: null,
  value: 5000,
  expected_revenue: 250,
  close_date: "2020-01-02",
});
const RENEWAL = deal(7, "Renewal", {
  stage: "won",
  value: 12000,
  probability: 100,
  expected_revenue: 12000,
  close_date: "2026-10-01",
});
const EXPANSION = deal(8, "Expansion", {
  stage: "lost",
  value: 8000,
  probability: 0,
  expected_revenue: 0,
  close_date: "2026-09-15",
});
const DEALS = [SUPPORT, PILOT, RENEWAL, EXPANSION];

const FAILED = { status: 500, body: { detail: "Something went wrong." } };
const FORM_READS = {
  "GET /meta": META,
  "GET /organizations": [{ id: 1, name: "Harbor & Pine" }],
  "GET /contacts": [{ id: 11, name: "Sam Carter", organization_id: 1, organization_name: "Harbor & Pine" }],
};

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname + location.search}</output>;
}

async function showDeals(address = "/deals", routes: Record<string, unknown> = {}) {
  const calls = mockApi({ "GET /deals": DEALS, ...FORM_READS, ...routes });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <MemoryRouter initialEntries={[address]}>
        <Deals />
        <Address />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Deals" });
  return calls;
}

async function names() {
  await screen.findByRole("table");
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

async function rowOf(name: string) {
  return within(await screen.findByRole("row", { name: new RegExp(name) }));
}

describe("the deals table", () => {
  it("lists deals by close date, earliest first, each linking to its page", async () => {
    await showDeals();
    expect(await names()).toEqual(["Pilot", "Expansion", "Renewal", "Annual support"]);
    expect(document.title).toBe("Deals | Accountable");
    expect(screen.getByRole("link", { name: "Annual support" }).getAttribute("href")).toBe("/deals/5");
  });

  it("shows each deal's organization, main contact, stage and figures", async () => {
    await showDeals();
    const support = await rowOf("Annual support");
    expect(support.getByText("Harbor & Pine")).toBeTruthy();
    expect(support.getByText("Sam Carter")).toBeTruthy();
    expect(support.getByText("Proposal")).toBeTruthy();
    expect(support.getByText("$36,000")).toBeTruthy();
    expect(support.getByText("40%")).toBeTruthy();
    expect(support.getByText("$14,400")).toBeTruthy();
    expect(support.getByText("Dec 18, 2999")).toBeTruthy();
  });

  it("shows None for a blank organization and main contact", async () => {
    await showDeals();
    expect((await rowOf("Pilot")).getAllByText("None")).toHaveLength(2);
  });

  it("leaves expected revenue blank for won and lost deals", async () => {
    await showDeals();
    const renewal = await rowOf("Renewal");
    expect(renewal.getAllByText("$12,000")).toHaveLength(1);
    expect((await rowOf("Expansion")).queryByText("$0")).toBeNull();
  });

  it("marks only open deals past their close date as late", async () => {
    await showDeals();
    expect((await rowOf("Pilot")).getByText("Late")).toBeTruthy();
    expect((await rowOf("Annual support")).queryByText("Late")).toBeNull();
    expect((await rowOf("Renewal")).queryByText("Late")).toBeNull();
  });

  it("sorts the Stage column in pipeline order", async () => {
    await showDeals();
    await user().click(await screen.findByRole("button", { name: "Stage" }));
    expect(await names()).toEqual(["Pilot", "Annual support", "Renewal", "Expansion"]);
  });

  it("sorts expected revenue with won and lost deals last either way", async () => {
    await showDeals();
    await user().click(await screen.findByRole("button", { name: "Expected revenue" }));
    const ascending = await names();
    expect(ascending.slice(0, 2)).toEqual(["Pilot", "Annual support"]);
    expect(ascending.slice(2).sort()).toEqual(["Expansion", "Renewal"]);

    await user().click(screen.getByRole("button", { name: "Expected revenue" }));
    const descending = await names();
    expect(descending.slice(0, 2)).toEqual(["Annual support", "Pilot"]);
    expect(descending.slice(2).sort()).toEqual(["Expansion", "Renewal"]);
  });

  it("finds deals by stage name", async () => {
    await showDeals();
    await user().type(await screen.findByRole("searchbox"), "propos");
    expect(await names()).toEqual(["Annual support"]);
  });
});

describe("the won-only view the dashboard links to", () => {
  it("shows only won deals, with a button that shows every stage", async () => {
    await showDeals("/deals?stage=won");
    expect(await names()).toEqual(["Renewal"]);

    await user().click(screen.getByRole("button", { name: "Show every stage" }));
    expect(await names()).toHaveLength(4);
    expect(screen.getByTestId("address").textContent).toBe("/deals");
    expect(screen.queryByRole("button", { name: "Show every stage" })).toBeNull();
  });

  it("names the stage on that button", async () => {
    await showDeals("/deals?stage=won");
    expect((await screen.findByRole("button", { name: "Show every stage" })).textContent).toBe("Won deals only");
  });

  it("is cleared along with a search that matches nothing", async () => {
    await showDeals("/deals?stage=won&q=pilot");
    expect(await screen.findByText("No deals match.")).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Clear search" }));
    expect(await names()).toHaveLength(4);
    expect(screen.getByTestId("address").textContent).toBe("/deals");
  });

  it("isn't offered for a stage the address doesn't know", async () => {
    await showDeals("/deals?stage=closed");
    expect(await names()).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Show every stage" })).toBeNull();
  });
});

describe("adding, editing and deleting from the deals table", () => {
  it("Add deal opens an empty form", async () => {
    await showDeals();
    await user().click(screen.getByRole("button", { name: "Add deal" }));
    const form = within(await screen.findByRole("dialog", { name: "Add deal" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    await user().click(form.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("invites the first deal when there are none, from either Add button", async () => {
    await showDeals("/deals", { "GET /deals": [] });
    expect(await screen.findByText("No deals yet. Add the first one.")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Add deal" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      await user().click(button);
      await user().click(await screen.findByRole("button", { name: "Cancel" }));
    }
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Edit opens the deal's form, filled in", async () => {
    await showDeals();
    await user().click(await screen.findByRole("button", { name: "Edit Annual support" }));
    const form = within(await screen.findByRole("dialog", { name: "Edit deal" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Annual support");
  });

  it("Delete asks first, then deletes that deal", async () => {
    const calls = await showDeals("/deals", {
      "GET /deals/7/delete-impact": { activities: 0, stage_changes: 1, won: true, value: 12000 },
      "DELETE /deals/7": () => ({ status: 204, body: null }),
    });
    await user().click(await screen.findByRole("button", { name: "Delete Renewal" }));
    const confirm = within(await screen.findByRole("alertdialog", { name: "Delete Renewal?" }));
    await confirm.findByText(/Its revenue of \$12,000 will leave the dashboard/);
    await user().click(confirm.getByRole("button", { name: "Delete deal" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/deals/7"]);
  });
});

describe("a deals table that can't be read", () => {
  it("says so, and Try again reads it", async () => {
    let broken = true;
    await showDeals("/deals", { "GET /deals": () => (broken ? FAILED : { body: DEALS }) });
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load this.");
    expect(screen.queryByRole("table")).toBeNull();

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Annual support" })).toBeTruthy();
  });
});
