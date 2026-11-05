import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DealDetail, OrganizationDetail } from "../crm/queries";
import { mockApi, renderApp, user } from "../test-utils";
import { DealInvoices, OrganizationInvoices } from "./panels";
import type { InvoiceRow } from "./queries";

const WHO = {
  created_at: "2026-10-01T12:00:00Z",
  created_by: null,
  updated_at: "2026-10-01T12:00:00Z",
  updated_by: null,
};

const DEAL: DealDetail = {
  id: 3,
  name: "Annual support",
  organization_id: 2,
  organization_name: "Harbor & Pine",
  main_contact_id: null,
  main_contact_name: null,
  stage: "won",
  value: 12000,
  probability: 100,
  expected_revenue: 0,
  close_date: "2026-10-30",
  position: 0,
  ...WHO,
};

const ORGANIZATION: OrganizationDetail = {
  id: 2,
  name: "Harbor & Pine",
  website: null,
  industry: null,
  notes: null,
  contacts: [],
  deals: [],
  ...WHO,
};

const ROWS: InvoiceRow[] = [
  {
    id: 9,
    number: null,
    issue_order: null,
    shows_as: "draft",
    deal: { id: 3, name: "Annual support" },
    organization: { id: 2, name: "Harbor & Pine" },
    bill_to: null,
    issue_date: null,
    due_date: null,
    total_cents: 50000,
    owed_cents: 0,
  },
  {
    id: 8,
    number: "INV-0042",
    issue_order: 42,
    shows_as: "part_paid",
    deal: { id: 3, name: "Annual support" },
    organization: { id: 2, name: "Harbor & Pine" },
    bill_to: null,
    issue_date: "2026-10-30",
    due_date: "2026-11-29",
    total_cents: 125000,
    owed_cents: 50000,
  },
];

function panel() {
  return within(screen.getByRole("region", { name: "Invoices" }));
}

describe("a deal's Invoices panel", () => {
  it("lists its invoices, newest first, each with its number or Draft, its chip, its total and what's owed", async () => {
    const calls = mockApi({ "GET /invoices?deal_id=3": ROWS });
    renderApp(<DealInvoices record={DEAL} />);
    const links = await panel().findAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Draft", "/invoices/9"],
      ["INV-0042", "/invoices/8"],
    ]);
    expect(panel().getByText("Part paid")).toBeTruthy();
    expect(panel().getByText("$1,250.00")).toBeTruthy();
    expect(panel().getByText("$500.00 owed")).toBeTruthy();
    expect(calls.map((call) => call.path)).toEqual(["/invoices?deal_id=3"]);
  });

  it("has New invoice on a won deal, which starts a draft", async () => {
    const calls = mockApi({
      "GET /invoices?deal_id=3": [],
      "POST /invoices": () => ({ status: 201, body: { id: 41 } }),
    });
    renderApp(<DealInvoices record={DEAL} />);
    expect(await panel().findByText("No invoices yet.")).toBeTruthy();
    await user().click(panel().getByRole("button", { name: "New invoice" }));
    await waitFor(() =>
      expect(calls.filter((call) => call.method === "POST")).toEqual([
        { method: "POST", path: "/invoices", body: { deal_id: 3 } },
      ]),
    );
  });

  it("says a deal can be invoiced once it's won, with no New invoice", async () => {
    mockApi({ "GET /invoices?deal_id=3": [] });
    renderApp(<DealInvoices record={{ ...DEAL, stage: "negotiation" }} />);
    expect(await panel().findByText("A deal can be invoiced once it's won.")).toBeTruthy();
    expect(panel().queryByRole("button", { name: "New invoice" })).toBeNull();
  });

  it("keeps a moved-out-of-Won deal's invoices listed", async () => {
    mockApi({ "GET /invoices?deal_id=3": ROWS });
    renderApp(<DealInvoices record={{ ...DEAL, stage: "lost" }} />);
    expect(await panel().findAllByRole("link")).toHaveLength(2);
  });

  it("says when its invoices couldn't be read, and Try again reads them", async () => {
    let reads = 0;
    mockApi({
      "GET /invoices?deal_id=3": () => {
        reads += 1;
        return reads === 1 ? { status: 500, body: { detail: "Something went wrong." } } : { body: ROWS };
      },
    });
    renderApp(<DealInvoices record={DEAL} />);
    expect(await panel().findByText("Couldn't load this.")).toBeTruthy();
    expect(panel().queryByText("No invoices yet.")).toBeNull();
    await user().click(panel().getByRole("button", { name: "Try again" }));
    expect(await panel().findAllByRole("link")).toHaveLength(2);
    expect(panel().queryByText("Couldn't load this.")).toBeNull();
  });

  it("keeps its invoices when a later read fails, and says they may be out of date", async () => {
    let reads = 0;
    mockApi({
      "GET /invoices?deal_id=3": () => {
        reads += 1;
        return reads === 1 ? { body: ROWS } : { status: 500, body: { detail: "Something went wrong." } };
      },
    });
    const { client } = renderApp(<DealInvoices record={DEAL} />);
    expect(await panel().findAllByRole("link")).toHaveLength(2);
    await act(() => client.refetchQueries({ queryKey: ["invoices"] }));
    expect(await panel().findByText("Couldn't refresh this, so it may be out of date.")).toBeTruthy();
    expect(panel().getAllByRole("link")).toHaveLength(2);
    expect(panel().getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("an organization's Invoices panel", () => {
  it("shows each invoice's deal on a line of its own under the number, and no New invoice", async () => {
    const calls = mockApi({ "GET /invoices?organization_id=2": ROWS });
    renderApp(<OrganizationInvoices record={ORGANIZATION} />);
    const links = await panel().findAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Draft", "INV-0042"]);
    const rows = panel().getAllByRole("listitem");
    for (const row of rows) {
      const deal = within(row).getByText("Annual support");
      // The chip names the status, as the link does for a draft, so it's the one outside the link.
      const chip = within(row)
        .getAllByText(/^(Draft|Part paid)$/)
        .find((word) => !word.closest("a"))!;
      // Not on the line with the number and the chip, where a long name would be cut short.
      expect(deal.parentElement).not.toBe(chip.parentElement);
    }
    expect(panel().queryByRole("button", { name: "New invoice" })).toBeNull();
    expect(calls.map((call) => call.path)).toEqual(["/invoices?organization_id=2"]);
  });

  it("says when there are none", async () => {
    mockApi({ "GET /invoices?organization_id=2": [] });
    renderApp(<OrganizationInvoices record={ORGANIZATION} />);
    expect(await panel().findByText("No invoices yet.")).toBeTruthy();
  });
});
