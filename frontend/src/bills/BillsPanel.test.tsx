import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrganizationDetail } from "../crm/queries";
import { mockApi, renderApp, user } from "../test-utils";
import { BillsPanel, panelOrder, unpaidLine } from "./BillsPanel";
import type { BillRow } from "./queries";

const KINGSGATE: OrganizationDetail = {
  id: 7,
  name: "Kingsgate Properties",
  website: null,
  industry: "Real estate",
  notes: null,
  contacts: [],
  deals: [],
  created_at: "2026-01-01T12:00:00Z",
  created_by: null,
  updated_at: "2026-01-01T12:00:00Z",
  updated_by: null,
};

function bill(id: number, number: string, dates: { bill: string; due: string; paid?: string }, total: number): BillRow {
  return {
    id,
    organization: { id: 7, name: "Kingsgate Properties" },
    bill_number: number,
    bill_date: dates.bill,
    due_date: dates.due,
    amount_cents: total,
    tax_cents: 0,
    total_cents: total,
    category: "office",
    notes: null,
    paid_on: dates.paid ?? null,
  };
}

// Today is Oct 31, 2026.
const NOVEMBER = bill(1, "KP-2611", { bill: "2026-11-01", due: "2026-12-01" }, 450000);
const OVERDUE = bill(2, "KP-2610", { bill: "2026-09-15", due: "2026-10-15" }, 110000);
const DUE_TODAY = bill(3, "KP-2609", { bill: "2026-10-01", due: "2026-10-31" }, 450000);
const PAID_SEPTEMBER = bill(4, "KP-2608", { bill: "2026-09-01", due: "2026-10-01", paid: "2026-09-28" }, 450000);
const PAID_AUGUST = bill(5, "KP-2607", { bill: "2026-08-01", due: "2026-08-31", paid: "2026-08-28" }, 450000);
const BILLS = [PAID_AUGUST, PAID_SEPTEMBER, NOVEMBER, OVERDUE, DUE_TODAY];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 12, 0) });
});

afterEach(() => {
  vi.useRealTimers();
});

async function showPanel(bills: BillRow[]) {
  const calls = mockApi({
    "GET /bills?organization_id=7": bills,
    "GET /organizations": [
      { id: 6, name: "Harbor & Pine" },
      { id: 7, name: "Kingsgate Properties" },
    ],
  });
  renderApp(<BillsPanel record={KINGSGATE} />);
  await screen.findByRole("heading", { name: "Bills" });
  return calls;
}

function panel() {
  return within(screen.getByRole("region", { name: "Bills" }));
}

describe("an organization's bills", () => {
  it("are read from the bills area's own route", async () => {
    const calls = await showPanel(BILLS);
    await panel().findByRole("link", { name: "KP-2611" });
    expect(calls.map((call) => call.path)).toEqual(["/bills?organization_id=7"]);
  });

  it("list unpaid ones first, earliest due first, then paid ones, newest first", async () => {
    await showPanel(BILLS);
    await panel().findByRole("link", { name: "KP-2611" });
    expect(
      panel()
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["KP-2610", "KP-2609", "KP-2611", "KP-2608", "KP-2607"]);
    expect(panelOrder(BILLS).map((row) => row.id)).toEqual([2, 3, 1, 4, 5]);
  });

  it("show each bill's due date, total and status, linking to its page", async () => {
    await showPanel(BILLS);
    const overdue = within((await panel().findByRole("link", { name: "KP-2610" })).closest("li")!);
    expect(overdue.getByText("Oct 15, 2026")).toBeTruthy();
    expect(overdue.getByText("$1,100.00")).toBeTruthy();
    expect(overdue.getByText("Overdue")).toBeTruthy();
    expect(overdue.getByRole("link").getAttribute("href")).toBe("/bills/2");
    const dueToday = within(panel().getByRole("link", { name: "KP-2609" }).closest("li")!);
    expect(dueToday.getByText("Unpaid")).toBeTruthy();
    expect(within(panel().getByRole("link", { name: "KP-2608" }).closest("li")!).getByText("Paid")).toBeTruthy();
  });

  it("say how much is unpaid, and how much of it is overdue", async () => {
    await showPanel(BILLS);
    expect(await panel().findByText("$10,100.00 unpaid, $1,100.00 of it overdue")).toBeTruthy();
    expect(unpaidLine([NOVEMBER], "2026-10-31")).toBe("$4,500.00 unpaid");
    expect(unpaidLine([PAID_AUGUST], "2026-10-31")).toBeNull();
  });

  it("add up to the cent past what a JavaScript number holds", () => {
    // 46 bills at the most an amount and its tax can each be, and one for a cent.
    const most = Array.from({ length: 46 }, (_, index) =>
      bill(10 + index, `KP-${index}`, { bill: "2026-10-01", due: "2026-12-01" }, 200_000_000_000_000),
    );
    const cent = bill(99, "KP-CENT", { bill: "2026-10-01", due: "2026-10-30" }, 1);
    expect(unpaidLine([...most, cent], "2026-10-31")).toBe("$92,000,000,000,000.01 unpaid, $0.01 of it overdue");
  });

  it("say so when there are none", async () => {
    await showPanel([]);
    expect(await panel().findByText("No bills from this organization.")).toBeTruthy();
    expect(panel().queryByText(/unpaid/)).toBeNull();
  });

  it("scroll once there are more than about 8", async () => {
    await showPanel(BILLS);
    const list = (await panel().findByRole("link", { name: "KP-2611" })).closest("ul")!;
    expect(list.className).toContain("max-h-[296px]");
    expect(list.className).toContain("overflow-y-auto");
  });

  it("have Add bill, which fills in the organization as the supplier", async () => {
    await showPanel(BILLS);
    await user().click(panel().getByRole("button", { name: "Add bill" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Add bill" }));
    expect((await dialog.findByRole("combobox", { name: "Supplier" })).textContent).toBe("Kingsgate Properties");
  });
});
