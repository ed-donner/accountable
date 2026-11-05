import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { Toaster, toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryDefaults } from "../../lib/queryDefaults";
import { holdSaves, mockApi, user, type Call } from "../../test-utils";
import type { BillRow, Category } from "../queries";
import { Bills } from "./Bills";

function bill(
  id: number,
  supplier: string,
  number: string,
  category: Category,
  dates: { bill: string; due: string; paid?: string },
  total: number,
): BillRow {
  return {
    id,
    organization: { id: id + 100, name: supplier },
    bill_number: number,
    bill_date: dates.bill,
    due_date: dates.due,
    amount_cents: total,
    tax_cents: 0,
    total_cents: total,
    category,
    notes: null,
    paid_on: dates.paid ?? null,
  };
}

// Today is Oct 31, 2026.
const SUBSCRIPTION = bill(
  1,
  "Northwind Software",
  "NS-1",
  "software",
  { bill: "2026-10-03", due: "2026-11-02" },
  135005,
);
const RENT = bill(2, "Kingsgate Properties", "KP-1", "office", { bill: "2026-09-01", due: "2026-10-01" }, 450000);
const CONTRACTOR = bill(
  3,
  "Fieldstone Development",
  "FD-1",
  "contractors",
  { bill: "2026-09-28", due: "2026-10-28", paid: "2026-10-26" },
  712500,
);
const TRIP = bill(4, "Wayfarer Travel", "WT-1", "travel", { bill: "2026-10-01", due: "2026-10-31" }, 52260);
const INSURANCE = bill(
  5,
  "Marlowe Insurance",
  "POL-1",
  "other",
  { bill: "2026-01-05", due: "2026-02-04", paid: "2026-02-01" },
  640000,
);
const BILLS = [SUBSCRIPTION, RENT, CONTRACTOR, TRIP, INSURANCE];

const FAILED = { status: 500, body: { detail: "Something went wrong." } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 12, 0) });
});

afterEach(() => {
  vi.useRealTimers();
});

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname + location.search}</output>;
}

/** A backend holding these bills, whose saves change what the next read gets. */
function backend(rows: BillRow[], routes: Record<string, unknown> = {}) {
  let held = rows;
  const saving = (id: number) => (body: unknown) => {
    held = held.map((row) => (row.id === id ? { ...row, ...(body as Partial<BillRow>) } : row));
    return { body: held.find((row) => row.id === id) };
  };
  const deleting = (id: number) => () => {
    held = held.filter((row) => row.id !== id);
    return { status: 204, body: null };
  };
  return mockApi({
    "GET /bills": () => ({ body: held }),
    "GET /organizations": [{ id: 101, name: "Northwind Software" }],
    ...Object.fromEntries(rows.map((row) => [`PATCH /bills/${row.id}`, saving(row.id)])),
    ...Object.fromEntries(rows.map((row) => [`DELETE /bills/${row.id}`, deleting(row.id)])),
    ...routes,
  });
}

async function showBills(rows: BillRow[] = BILLS, address = "/bills", routes = {}) {
  const calls = backend(rows, routes);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <MemoryRouter initialEntries={[address]}>
        <Bills />
        <Address />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Bills" });
  return calls;
}

function names() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

async function rowOf(supplier: string) {
  return within(await screen.findByRole("row", { name: new RegExp(supplier) }));
}

function address() {
  return screen.getByTestId("address").textContent;
}

function filter(name: RegExp) {
  return screen.getByRole("button", { name });
}

function writes(calls: Call[]) {
  return calls.filter((call) => call.method !== "GET").map(({ method, path, body }) => ({ method, path, body }));
}

function reads(calls: Call[]) {
  return calls.filter((call) => call.method === "GET" && call.path === "/bills").length;
}

describe("the bills table", () => {
  it("opens on Unpaid, by due date, so overdue bills come first", async () => {
    await showBills();
    await screen.findByRole("link", { name: "Northwind Software" });
    expect(document.title).toBe("Bills | Accountable");
    expect(names()).toEqual(["Kingsgate Properties", "Wayfarer Travel", "Northwind Software"]);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Supplier",
      "Bill number",
      "Category",
      "Bill date",
      "Due date",
      "Total",
      "Status",
      "Actions",
    ]);
    expect(screen.getByRole("link", { name: "Northwind Software" }).getAttribute("href")).toBe("/bills/1");
    expect(address()).toBe("/bills");
  });

  it("shows totals with their cents, dates, each category with its swatch, and the status chips", async () => {
    await showBills(BILLS, "/bills?status=all");
    const subscription = await rowOf("Northwind Software");
    expect(subscription.getByText("$1,350.05")).toBeTruthy();
    expect(subscription.getByText("NS-1")).toBeTruthy();
    expect(subscription.getByText("Oct 3, 2026")).toBeTruthy();
    expect(subscription.getByText("Nov 2, 2026")).toBeTruthy();
    const category = subscription.getByText("Software").parentElement!;
    expect(category.querySelector("[aria-hidden='true']")?.className).toContain("bg-sea-green");
    expect(subscription.getByText("Unpaid")).toBeTruthy();
    expect((await rowOf("Kingsgate Properties")).getByText("Overdue")).toBeTruthy();
    expect((await rowOf("Fieldstone Development")).getByText("Paid")).toBeTruthy();
    expect((await rowOf("Marlowe Insurance")).getByText("Other")).toBeTruthy();
  });

  it("counts each filter's bills, with the overdue ones among the unpaid", async () => {
    await showBills();
    await screen.findByRole("link", { name: "Northwind Software" });
    const buttons = within(screen.getByRole("group", { name: "Filter by status" })).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["All (5)", "Unpaid (3)", "Overdue (1)", "Paid (2)"]);
    expect(filter(/^Unpaid/).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps each filter in the address", async () => {
    await showBills();
    await screen.findByRole("link", { name: "Northwind Software" });

    await user().click(filter(/^Overdue/));
    expect(names()).toEqual(["Kingsgate Properties"]);
    expect(address()).toBe("/bills?status=overdue");

    await user().click(filter(/^Paid/));
    expect(names()).toEqual(["Marlowe Insurance", "Fieldstone Development"]);
    expect(address()).toBe("/bills?status=paid");

    await user().click(filter(/^All/));
    expect(names()).toHaveLength(5);
    expect(address()).toBe("/bills?status=all");

    await user().click(filter(/^Unpaid/));
    expect(names()).toHaveLength(3);
    expect(address()).toBe("/bills");
  });

  it("sorts totals by amount, categories in their order and statuses overdue first", async () => {
    await showBills(BILLS, "/bills?status=all");
    await screen.findByRole("link", { name: "Northwind Software" });
    await user().click(screen.getByRole("button", { name: "Total" }));
    expect(names()).toEqual([
      "Wayfarer Travel",
      "Northwind Software",
      "Kingsgate Properties",
      "Marlowe Insurance",
      "Fieldstone Development",
    ]);
    await user().click(screen.getByRole("button", { name: "Category" }));
    expect(names()).toEqual([
      "Northwind Software",
      "Fieldstone Development",
      "Wayfarer Travel",
      "Kingsgate Properties",
      "Marlowe Insurance",
    ]);
    await user().click(screen.getByRole("button", { name: "Status" }));
    expect(names().slice(0, 1)).toEqual(["Kingsgate Properties"]);
    expect(names().slice(3).sort()).toEqual(["Fieldstone Development", "Marlowe Insurance"]);
  });

  it("finds bills by supplier, number and category, but not by status", async () => {
    await showBills(BILLS, "/bills?status=all&q=travel");
    await screen.findByRole("link", { name: "Wayfarer Travel" });
    expect(names()).toEqual(["Wayfarer Travel"]);
    await user().clear(screen.getByRole("searchbox"));
    await user().type(screen.getByRole("searchbox"), "kp-1");
    expect(names()).toEqual(["Kingsgate Properties"]);
    await user().clear(screen.getByRole("searchbox"));
    await user().type(screen.getByRole("searchbox"), "contractors");
    expect(names()).toEqual(["Fieldstone Development"]);
    await user().clear(screen.getByRole("searchbox"));
    await user().type(screen.getByRole("searchbox"), "overdue");
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("a bill left on screen past midnight", () => {
  it("turns overdue, with its count, without the bills being read again", async () => {
    vi.setSystemTime(new Date(2026, 9, 31, 23, 59));
    const calls = await showBills(BILLS, "/bills?status=all");
    expect((await rowOf("Wayfarer Travel")).getByText("Unpaid")).toBeTruthy();
    expect(filter(/^Overdue/).textContent).toBe("Overdue (1)");

    vi.setSystemTime(new Date(2026, 10, 1, 0, 1));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(await (await rowOf("Wayfarer Travel")).findByText("Overdue")).toBeTruthy();
    expect(filter(/^Overdue/).textContent).toBe("Overdue (2)");
    expect(reads(calls)).toBe(1);
  });
});

describe("marking a bill paid from its row", () => {
  it("asks the date with today filled in, sends it once, says so, and moves focus to the search box", async () => {
    const calls = await showBills();
    await user().click(await screen.findByRole("button", { name: "Mark paid bill NS-1 from Northwind Software" }));

    const dialog = within(await screen.findByRole("dialog", { name: "Mark bill NS-1 paid" }));
    expect((dialog.getByLabelText("Paid on") as HTMLInputElement).value).toBe("2026-10-31");
    const release = holdSaves();
    await user().dblClick(dialog.getByRole("button", { name: "Mark paid" }));
    release();

    expect(await screen.findByText("Bill marked paid.")).toBeTruthy();
    expect(writes(calls)).toEqual([{ method: "PATCH", path: "/bills/1", body: { paid_on: "2026-10-31" } }]);
    await waitFor(() => expect(names()).toEqual(["Kingsgate Properties", "Wayfarer Travel"]));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("searchbox")));
  });

  it("takes an earlier date, and refuses one before the bill date", async () => {
    const calls = await showBills();
    await user().click(await screen.findByRole("button", { name: "Mark paid bill NS-1 from Northwind Software" }));
    const box = (await screen.findByLabelText("Paid on")) as HTMLInputElement;

    await user().clear(box);
    await user().type(box, "2026-10-02");
    await user().click(screen.getByRole("button", { name: "Mark paid" }));
    expect(await screen.findByText("The paid date can't be before the bill date")).toBeTruthy();

    await user().clear(box);
    await user().type(box, "2026-10-20");
    await user().click(screen.getByRole("button", { name: "Mark paid" }));
    expect(await screen.findByText("Bill marked paid.")).toBeTruthy();
    expect(writes(calls)).toEqual([{ method: "PATCH", path: "/bills/1", body: { paid_on: "2026-10-20" } }]);
  });

  it("leaves the bill unpaid and the dialog open when it fails, and says so", async () => {
    await showBills(BILLS, "/bills", { "PATCH /bills/1": () => FAILED });
    await user().click(await screen.findByRole("button", { name: "Mark paid bill NS-1 from Northwind Software" }));
    await user().click(await screen.findByRole("button", { name: "Mark paid" }));
    expect(await screen.findByText("Something went wrong.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Mark bill NS-1 paid" })).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Cancel" }));
    expect(names()).toContain("Northwind Software");
  });

  it("keeps focus on the row's button when the row stays, under All", async () => {
    await showBills(BILLS, "/bills?status=all");
    const button = await screen.findByRole("button", { name: "Mark paid bill NS-1 from Northwind Software" });
    await user().click(button);
    await user().click(await screen.findByRole("button", { name: "Mark paid" }));
    expect(await screen.findByRole("button", { name: "Mark unpaid bill NS-1 from Northwind Software" })).toBe(button);
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
});

describe("marking a bill unpaid from its row", () => {
  it("says so with Undo for 10 seconds, which puts back the date it had", async () => {
    const success = vi.spyOn(toast, "success");
    const calls = await showBills(BILLS, "/bills?status=paid");
    await user().click(
      await screen.findByRole("button", { name: "Mark unpaid bill FD-1 from Fieldstone Development" }),
    );

    expect(await screen.findByText("Bill marked unpaid.")).toBeTruthy();
    expect(success).toHaveBeenCalledWith("Bill marked unpaid.", expect.objectContaining({ duration: 10_000 }));
    await waitFor(() => expect(names()).toEqual(["Marlowe Insurance"]));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("searchbox")));

    await user().click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Bill marked paid.")).toBeTruthy();
    expect(writes(calls)).toEqual([
      { method: "PATCH", path: "/bills/3", body: { paid_on: null } },
      { method: "PATCH", path: "/bills/3", body: { paid_on: "2026-10-26" } },
    ]);
    await waitFor(() => expect(names()).toEqual(["Marlowe Insurance", "Fieldstone Development"]));
  });

  it("says so when it fails, and leaves the bill paid", async () => {
    await showBills(BILLS, "/bills?status=paid", { "PATCH /bills/3": () => FAILED });
    await user().click(
      await screen.findByRole("button", { name: "Mark unpaid bill FD-1 from Fieldstone Development" }),
    );
    expect(await screen.findByText("Something went wrong.")).toBeTruthy();
    expect(names()).toContain("Fieldstone Development");
  });
});

describe("deleting from the bills table", () => {
  it("asks first, naming the bill and its supplier", async () => {
    const calls = await showBills();
    await user().click(await screen.findByRole("button", { name: "Delete bill NS-1 from Northwind Software" }));

    const dialog = within(await screen.findByRole("alertdialog"));
    expect(dialog.getByRole("heading").textContent).toBe("Delete bill NS-1 from Northwind Software?");
    expect(dialog.getByText("It will leave the dashboard's Money section. This can't be undone.")).toBeTruthy();
    await user().click(dialog.getByRole("button", { name: "Delete bill" }));

    expect(await screen.findByText("Bill deleted.")).toBeTruthy();
    expect(writes(calls)).toEqual([{ method: "DELETE", path: "/bills/1", body: undefined }]);
    await waitFor(() => expect(names()).toEqual(["Kingsgate Properties", "Wayfarer Travel"]));
  });
});

describe("an empty bills table", () => {
  it("invites the first bill when there are none at all", async () => {
    await showBills([]);
    expect(await screen.findByText("No bills yet. Add the first one.")).toBeTruthy();
    await user().click(screen.getAllByRole("button", { name: "Add bill" })[1]);
    expect(await screen.findByRole("dialog", { name: "Add bill" })).toBeTruthy();
  });

  it("says when no bill is unpaid, with a button that shows all of them", async () => {
    await showBills([CONTRACTOR, INSURANCE]);
    expect(await screen.findByText("No unpaid bills.")).toBeTruthy();
    expect(screen.queryByText("No bills yet. Add the first one.")).toBeNull();
    await user().click(screen.getByRole("button", { name: "Show all bills" }));
    expect(names()).toEqual(["Marlowe Insurance", "Fieldstone Development"]);
    expect(address()).toBe("/bills?status=all");
  });

  it("says when no bill is overdue", async () => {
    await showBills([SUBSCRIPTION], "/bills?status=overdue");
    expect(await screen.findByText("No overdue bills.")).toBeTruthy();
  });

  it("says when a search matches none under the filter, and how many match under All", async () => {
    await showBills(BILLS, "/bills?q=fieldstone");
    expect(await screen.findByText('No unpaid bills match "fieldstone". 1 bill matches under All.')).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Show all bills" }));
    expect(names()).toEqual(["Fieldstone Development"]);
    expect(address()).toBe("/bills?q=fieldstone&status=all");
  });

  it("offers to clear a search that matches nothing, leaving the filter as it was", async () => {
    await showBills(BILLS, "/bills?status=overdue&q=acme");
    expect(await screen.findByText('No overdue bills match "acme".')).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show all bills" })).toBeNull();
    await user().click(screen.getByRole("button", { name: "Clear search" }));
    expect(address()).toBe("/bills?status=overdue");
    expect(names()).toEqual(["Kingsgate Properties"]);
  });

  it("says when the bills couldn't be read, and tries again", async () => {
    let failing = true;
    backend(BILLS);
    const calls = mockApi({ "GET /bills": () => (failing ? FAILED : { body: BILLS }) });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
        <MemoryRouter initialEntries={["/bills"]}>
          <Bills />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    expect(screen.queryByText("No bills yet. Add the first one.")).toBeNull();
    failing = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Northwind Software" })).toBeTruthy();
    expect(reads(calls)).toBe(2);
  });
});
