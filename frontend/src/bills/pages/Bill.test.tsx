import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryDefaults } from "../../lib/queryDefaults";
import { mockApi, user, type Call } from "../../test-utils";
import { entriesReply, entry } from "../../books/test-books";
import type { BillDetail } from "../queries";
import { Bill } from "./Bill";

const ALEX = { id: "alex", name: "Alex Rivera" };
const DANA = { id: "dana", name: "Dana Whitfield" };
const ADDED = "2026-10-12T12:00:00Z";
const CHANGED = "2026-10-30T12:00:00Z";

// Today is Oct 31, 2026.
const SUBSCRIPTION: BillDetail = {
  id: 9,
  organization: { id: 1, name: "Northwind Software" },
  bill_number: "INV-0042",
  bill_date: "2026-10-03",
  due_date: "2026-11-02",
  amount_cents: 124000,
  tax_cents: 11005,
  total_cents: 135005,
  category: "software",
  notes: "Ten seats.\nBilled monthly.",
  paid_on: null,
  created_at: ADDED,
  created_by: ALEX,
  updated_at: ADDED,
  updated_by: ALEX,
};

const PAID: BillDetail = { ...SUBSCRIPTION, paid_on: "2026-10-30", updated_at: CHANGED, updated_by: DANA };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 12, 0) });
});

afterEach(() => {
  vi.useRealTimers();
});

function Address() {
  return <output data-testid="address">{useLocation().pathname}</output>;
}

function show(address = "/bills/9") {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <MemoryRouter initialEntries={[address]}>
        <Routes>
          <Route path="/bills/:id" element={<Bill />} />
          <Route path="*" element={<Address />} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** A backend holding this bill, whose saves change what the next read gets. */
function backend(bill: BillDetail, routes: Record<string, unknown> = {}) {
  let held = bill;
  return mockApi({
    "GET /bills/9": () => ({ body: held }),
    "PATCH /bills/9": (body: unknown) => {
      held = { ...held, ...(body as Partial<BillDetail>), updated_at: CHANGED, updated_by: DANA };
      return { body: held };
    },
    "DELETE /bills/9": () => ({ status: 204, body: null }),
    "GET /bills": [],
    ...routes,
  });
}

function details() {
  return within(screen.getByRole("region", { name: "Details" }));
}

function headerButtons() {
  return screen
    .getAllByRole("button")
    .filter((button) => ["Edit", "Mark paid", "Mark unpaid", "Delete"].includes(button.textContent ?? ""))
    .map((button) => button.textContent);
}

function writes(calls: Call[]) {
  return calls.filter((call) => call.method !== "GET").map(({ method, path, body }) => ({ method, path, body }));
}

describe("a bill's page", () => {
  it("shows its number, supplier, status, total, amounts, category, dates and notes", async () => {
    backend(SUBSCRIPTION);
    show();
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Bill INV-0042");
    expect(document.title).toBe("Bill INV-0042 | Accountable");
    expect(screen.getByText("Unpaid")).toBeTruthy();
    const supplier = screen.getByRole("link", { name: "Northwind Software" });
    expect(supplier.getAttribute("href")).toBe("/organizations/1");
    expect(supplier.parentElement?.textContent).toBe("From Northwind Software");

    const total = details().getByText("$1,350.05");
    expect(total.className).toContain("text-[24px]");
    expect(details().getByText("Amount before tax").nextElementSibling?.textContent).toBe("$1,240.00");
    expect(details().getByText("Tax").nextElementSibling?.textContent).toBe("$110.05");
    expect(details().getByText("Category").nextElementSibling?.textContent).toBe("Software");
    expect(details().getByText("Bill date").nextElementSibling?.textContent).toBe("Oct 3, 2026");
    expect(details().getByText("Due date").nextElementSibling?.textContent).toBe("Nov 2, 2026");
    expect(details().getByText("Paid on").nextElementSibling?.textContent).toBe("Not paid yet");
    expect(details().getByText(/^Added by Alex Rivera on/).textContent).toBe("Added by Alex Rivera on Oct 12, 2026");
    expect(details().queryByText(/^Last changed/)).toBeNull();

    const notes = within(screen.getByRole("region", { name: "Notes" })).getByText(/^Ten seats/);
    expect(notes.textContent).toBe("Ten seats.\nBilled monthly.");
    expect(notes.className).toContain("whitespace-pre-wrap");
    expect(headerButtons()).toEqual(["Edit", "Mark paid", "Delete"]);
  });

  it("has an Accounting panel below the notes with the bill's entries", async () => {
    backend(SUBSCRIPTION, {
      "GET /books/entries?kind=bill&source_id=9&limit=500": entriesReply([
        entry({ description: "Bill INV-0042 from Northwind Software" }),
      ]),
    });
    show();
    const panel = await screen.findByRole("region", { name: "Accounting" });
    expect(await within(panel).findByRole("article")).toBeTruthy();
    const notes = screen.getByRole("region", { name: "Notes" });
    expect(notes.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says No entries. in the panel for a bill that posted none", async () => {
    backend(SUBSCRIPTION, { "GET /books/entries?kind=bill&source_id=9&limit=500": entriesReply([]) });
    show();
    const panel = await screen.findByRole("region", { name: "Accounting" });
    expect(await within(panel).findByText("No entries.")).toBeTruthy();
  });

  it("shows when it was paid, who last changed it, and Mark unpaid", async () => {
    backend(PAID);
    show();
    expect(await screen.findByText("Paid")).toBeTruthy();
    expect(details().getByText("Paid on").nextElementSibling?.textContent).toBe("Oct 30, 2026");
    expect(details().getByText(/^Last changed/).textContent).toBe("Last changed by Dana Whitfield on Oct 30, 2026");
    expect(headerButtons()).toEqual(["Edit", "Mark unpaid", "Delete"]);
  });

  it("shows Overdue once the due date has passed, and No notes without any", async () => {
    backend({ ...SUBSCRIPTION, due_date: "2026-10-30", notes: null });
    show();
    expect(await screen.findByText("Overdue")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Notes" })).getByText("No notes.")).toBeTruthy();
  });

  it("marks it paid on the date asked, then unpaid, staying on the page", async () => {
    const calls = backend(SUBSCRIPTION);
    show();
    await user().click(await screen.findByRole("button", { name: "Mark paid" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Mark bill INV-0042 paid" }));
    const box = dialog.getByLabelText("Paid on") as HTMLInputElement;
    expect(box.value).toBe("2026-10-31");
    await user().clear(box);
    await user().type(box, "2026-10-30");
    await user().click(dialog.getByRole("button", { name: "Mark paid" }));

    expect(await screen.findByText("Bill marked paid.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Mark unpaid" })).toBeTruthy();
    expect(details().getByText("Paid on").nextElementSibling?.textContent).toBe("Oct 30, 2026");

    await user().click(screen.getByRole("button", { name: "Mark unpaid" }));
    expect(await screen.findByText("Bill marked unpaid.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Mark paid" })).toBeTruthy();
    expect(writes(calls)).toEqual([
      { method: "PATCH", path: "/bills/9", body: { paid_on: "2026-10-30" } },
      { method: "PATCH", path: "/bills/9", body: { paid_on: null } },
    ]);
  });

  it("keeps focus on the header's button after marking it paid", async () => {
    backend(SUBSCRIPTION);
    show();
    const button = await screen.findByRole("button", { name: "Mark paid" });
    await user().click(button);
    await user().click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Mark paid" }));
    expect(await screen.findByRole("button", { name: "Mark unpaid" })).toBe(button);
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("asks before deleting, then returns to Bills", async () => {
    const calls = backend(SUBSCRIPTION);
    show();
    await user().click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = within(await screen.findByRole("alertdialog"));
    expect(dialog.getByRole("heading").textContent).toBe("Delete bill INV-0042 from Northwind Software?");
    await user().click(dialog.getByRole("button", { name: "Delete bill" }));
    expect(await screen.findByText("Bill deleted.")).toBeTruthy();
    expect((await screen.findByTestId("address")).textContent).toBe("/bills");
    expect(writes(calls)).toEqual([{ method: "DELETE", path: "/bills/9", body: undefined }]);
  });

  it("opens the form with the bill in it", async () => {
    backend(SUBSCRIPTION, { "GET /organizations": [{ id: 1, name: "Northwind Software" }] });
    show();
    await user().click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Edit bill" }));
    expect(((await dialog.findByLabelText("Bill number")) as HTMLInputElement).value).toBe("INV-0042");
  });
});

describe("an address that leads nowhere", () => {
  it.each(["/bills/abc", "/bills/0", "/bills/99999999999"])("says %s no longer exists without asking", async (path) => {
    const calls = mockApi({});
    show(path);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("This bill no longer exists");
    expect(screen.getByRole("link", { name: "Back to Bills" }).getAttribute("href")).toBe("/bills");
    expect(calls).toEqual([]);
  });

  it("says a bill that's gone no longer exists", async () => {
    mockApi({ "GET /bills/9": () => ({ status: 404, body: { detail: "Bill not found" } }) });
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "This bill no longer exists" })).toBeTruthy();
  });

  it("says a failed read failed, and tries again", async () => {
    let failing = true;
    mockApi({
      "GET /bills/9": () => (failing ? { status: 500, body: { detail: "Something went wrong." } } : { body: PAID }),
    });
    show();
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    failing = false;
    await act(() => user().click(screen.getByRole("button", { name: "Try again" })));
    expect(await screen.findByRole("heading", { level: 1, name: "Bill INV-0042" })).toBeTruthy();
  });
});
