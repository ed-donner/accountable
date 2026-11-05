import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { queryDefaults } from "../../lib/queryDefaults";
import { mockApi, user } from "../../test-utils";
import type { InvoiceRow } from "../queries";
import { Invoices } from "./Invoices";

function row(id: number, changes: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id,
    number: `INV-${String(id).padStart(4, "0")}`,
    shows_as: "issued",
    deal: { id: 100 + id, name: `Deal ${id}` },
    organization: { id: 1, name: "Harbor & Pine" },
    bill_to: "Harbor & Pine\nAttn: Sam Carter",
    issue_date: `2026-10-${String(id).padStart(2, "0")}`,
    due_date: `2026-11-${String(id).padStart(2, "0")}`,
    total_cents: 100000 * id,
    owed_cents: 100000 * id,
    issue_order: id,
    ...changes,
  };
}

const ROWS: InvoiceRow[] = [
  row(1, { shows_as: "paid", owed_cents: 0 }),
  row(2, { shows_as: "overdue" }),
  row(3, { shows_as: "part_paid", owed_cents: 50000 }),
  row(4, { shows_as: "void", owed_cents: 0, organization: { id: 2, name: "Quarry Lane Brewing" } }),
  row(5, {
    number: null,
    shows_as: "draft",
    issue_date: null,
    due_date: null,
    owed_cents: 0,
    issue_order: null,
    organization: { id: 3, name: "Juniper Health" },
    bill_to: "Juniper Health\nAttn: Hannah Okafor",
  }),
  // Issued after INV-0004 under a new prefix, so it sorts after it by number though "B" comes first.
  row(6, { number: "B-0005", issue_date: "2026-10-30" }),
];

const DEALS = [
  { id: 7, name: "Annual support", stage: "won", organization_name: "Harbor & Pine" },
  { id: 8, name: "Pilot program", stage: "proposal", organization_name: "Fernhill Veterinary" },
];

function open(path = "/invoices", routes: Record<string, unknown> = {}) {
  const calls = mockApi({ "GET /invoices": ROWS, "GET /deals": DEALS, ...routes });
  const router = createMemoryRouter(
    [
      { path: "/invoices", element: <Invoices /> },
      { path: "/invoices/:id", element: <p>The invoice's page</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { calls, router };
}

function shownRows() {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((tableRow) => within(tableRow).getAllByRole("cell")[0].textContent);
}

function filter() {
  return within(screen.getByRole("group", { name: "Filter by status" }));
}

describe("the Invoices table", () => {
  it("has its columns, issued newest first and drafts last, with no Edit or Delete on a row", async () => {
    open();
    await screen.findByRole("table");
    const headings = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Number", "Organization", "Deal", "Status", "Issued", "Due", "Total", "Owed"]);
    expect(shownRows()).toEqual(["B-0005", "INV-0004", "INV-0003", "INV-0002", "INV-0001", "Draft"]);
    expect(screen.queryByRole("button", { name: /^Edit|^Delete/ })).toBeNull();
  });

  it("shows a draft as Draft, with its deal's organization, and money with its cents", async () => {
    open();
    const draft = (await screen.findByRole("link", { name: "Draft" })).closest("tr")!;
    expect(within(draft).getByText("Juniper Health")).toBeTruthy();
    expect(within(draft).getByText("$5,000.00")).toBeTruthy();
    expect(within(draft).getByText("$0.00")).toBeTruthy();
    const overdue = screen.getByRole("link", { name: "INV-0002" }).closest("tr")!;
    expect(within(overdue).getByText("Overdue")).toBeTruthy();
  });

  it("filters by what each shows as, with each one's count, and keeps the filter in the address", async () => {
    const { router } = open();
    await screen.findByRole("table");
    const labels = filter()
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["All6", "Draft1", "Issued1", "Part paid1", "Overdue1", "Paid1", "Void1"]);
    await user().click(filter().getByRole("button", { name: /^Overdue/ }));
    expect(shownRows()).toEqual(["INV-0002"]);
    expect(router.state.location.search).toBe("?status=overdue");
  });

  it("opens showing Overdue from the dashboard's link", async () => {
    open("/invoices?status=overdue");
    await screen.findByRole("table");
    expect(shownRows()).toEqual(["INV-0002"]);
    expect(
      filter()
        .getByRole("button", { name: /^Overdue/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("sorts Number in the order issued, whatever the prefix, and Status in the filter's order", async () => {
    open();
    await screen.findByRole("table");
    await user().click(screen.getByRole("button", { name: "Number" }));
    expect(shownRows()).toEqual(["INV-0001", "INV-0002", "INV-0003", "INV-0004", "B-0005", "Draft"]);
    await user().click(screen.getByRole("button", { name: "Status" }));
    expect(shownRows()).toEqual(["Draft", "B-0005", "INV-0003", "INV-0002", "INV-0001", "INV-0004"]);
  });

  it("sorts Number by when each was issued, not when its draft was started, on the same day too", async () => {
    // Draft 11 was started first, but draft 12 was issued first. Then the prefix changed and 11 was issued.
    const sameDay = [
      row(11, { number: "B-0008", issue_date: "2026-11-02", issue_order: 8 }),
      row(12, { number: "INV-0007", issue_date: "2026-11-02", issue_order: 7 }),
    ];
    open("/invoices", { "GET /invoices": sameDay });
    await screen.findByRole("table");
    await user().click(screen.getByRole("button", { name: "Number" }));
    expect(shownRows()).toEqual(["INV-0007", "B-0008"]);
  });

  it("searches the number, the organization, the deal and the Bill to", async () => {
    open();
    await screen.findByRole("table");
    const box = screen.getByRole("searchbox", { name: "Search invoices" });
    await user().type(box, "hannah");
    await waitFor(() => expect(shownRows()).toEqual(["Draft"]));
    await user().clear(box);
    await user().type(box, "quarry");
    await waitFor(() => expect(shownRows()).toEqual(["INV-0004"]));
    await user().clear(box);
    await user().type(box, "deal 3");
    await waitFor(() => expect(shownRows()).toEqual(["INV-0003"]));
  });

  it("invites the first invoice when there are none", async () => {
    open("/invoices", { "GET /invoices": [] });
    expect(await screen.findByText("No invoices yet. Start one from a won deal.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "New invoice" })).toHaveLength(2);
  });

  it("asks for a deal from won deals only, then opens the new draft", async () => {
    const { calls, router } = open("/invoices", {
      "POST /invoices": () => ({ status: 201, body: { id: 41 } }),
    });
    await screen.findByRole("table");
    await user().click(screen.getByRole("button", { name: "New invoice" }));
    const dialog = within(await screen.findByRole("dialog", { name: "New invoice" }));
    await user().click(dialog.getByRole("button", { name: "New invoice" }));
    expect(dialog.getByText("Choose a won deal")).toBeTruthy();

    await user().click(dialog.getByRole("combobox", { name: "Deal" }));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["Annual supportHarbor & Pine"]);
    await user().click(screen.getByRole("option", { name: /Annual support/ }));
    await user().click(dialog.getByRole("button", { name: "New invoice" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/invoices/41"));
    expect(calls.filter((call) => call.method === "POST")).toEqual([
      { method: "POST", path: "/invoices", body: { deal_id: 7 } },
    ]);
  });
});
