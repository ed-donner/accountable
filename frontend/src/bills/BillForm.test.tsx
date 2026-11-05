import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { holdSaves, mockApi, renderApp, user, type Call } from "../test-utils";
import { BillForm, dueDateFor, typedTotal } from "./BillForm";
import type { Bill } from "./queries";

const ORGANIZATIONS = [
  { id: 1, name: "Northwind Software" },
  { id: 2, name: "Kingsgate Properties" },
];

const BILL: Bill = {
  id: 9,
  organization: { id: 1, name: "Northwind Software" },
  bill_number: "INV-0042",
  bill_date: "2026-10-01",
  due_date: "2026-11-15",
  amount_cents: 124000,
  tax_cents: 11005,
  total_cents: 135005,
  category: "software",
  notes: "Ten seats",
  paid_on: null,
};

const TAKEN = "This supplier already has a bill with this number";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 12, 0) });
});

afterEach(() => {
  vi.useRealTimers();
});

function api(extra = {}) {
  return mockApi({ "GET /organizations": ORGANIZATIONS, ...extra });
}

function field(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function total() {
  return screen.getByTestId("bill-total").textContent;
}

async function ready() {
  await screen.findByLabelText("Bill number");
}

async function setDate(label: string, value: string) {
  await user().clear(field(label));
  if (value) await user().type(field(label), value);
}

async function chooseSupplier(name: string) {
  await user().click(screen.getByRole("combobox", { name: "Supplier" }));
  await user().click(await screen.findByRole("option", { name }));
}

/** Everything a new bill needs, leaving the dates as they start. */
async function fillIn({ amount = "1,240", tax = "" } = {}) {
  await chooseSupplier("Northwind Software");
  await user().type(field("Bill number"), "INV-0042");
  await user().selectOptions(screen.getByLabelText("Category"), "software");
  await user().type(field("Amount"), amount);
  if (tax) await user().type(field("Tax"), tax);
}

function save() {
  return user().click(screen.getByRole("button", { name: "Save bill" }));
}

function sent(calls: Call[]) {
  return calls.filter((call) => call.method !== "GET");
}

async function alerts() {
  return (await screen.findAllByRole("alert")).map((alert) => alert.textContent);
}

describe("the due date", () => {
  it.each([
    ["2026-10-31", "2026-11-30"],
    ["2026-01-31", "2026-03-02"],
    ["2028-01-30", "2028-02-29"],
    ["2026-12-15", "2027-01-14"],
  ])("is 30 days after a bill date of %s", (billDate, dueDate) => {
    expect(dueDateFor(billDate)).toBe(dueDate);
  });

  it("starts as 30 days after today, the bill date's start, in a new bill", async () => {
    api();
    renderApp(<BillForm onClose={vi.fn()} />);
    await ready();
    expect(field("Bill date").value).toBe("2026-10-31");
    expect(field("Due date").value).toBe("2026-11-30");
    expect(field("Paid on").value).toBe("");
  });

  it("follows the bill date across a month's end and Feb 29, until it's typed in", async () => {
    api();
    renderApp(<BillForm onClose={vi.fn()} />);
    await ready();
    await setDate("Bill date", "2028-01-30");
    expect(field("Due date").value).toBe("2028-02-29");
    await setDate("Bill date", "2026-01-31");
    expect(field("Due date").value).toBe("2026-03-02");

    await setDate("Due date", "2026-04-15");
    await setDate("Bill date", "2026-02-01");
    expect(field("Due date").value).toBe("2026-04-15");
  });

  it("stays as saved when a bill is edited", async () => {
    api();
    renderApp(<BillForm record={BILL} onClose={vi.fn()} />);
    await ready();
    expect(field("Due date").value).toBe("2026-11-15");
    await setDate("Bill date", "2026-10-05");
    expect(field("Due date").value).toBe("2026-11-15");
  });
});

describe("the total", () => {
  it.each([
    ["1240", "", 124000],
    ["$1,240.00", "110.05", 135005],
    ["0.29", "0.01", 30],
    ["", "10", null],
    ["12", "abc", null],
    ["1.234", "", null],
  ])("adds an amount of %j and a tax of %j as whole cents", (amount, tax, cents) => {
    expect(typedTotal(amount, tax)).toBe(cents);
  });

  it("shows as the amount and the tax are typed", async () => {
    api();
    renderApp(<BillForm onClose={vi.fn()} />);
    await ready();
    expect(total()).toBe("Total");
    await user().type(field("Amount"), "1,240");
    expect(total()).toBe("Total$1,240.00");
    await user().type(field("Tax"), "110.05");
    expect(total()).toBe("Total$1,350.05");
    await user().type(field("Tax"), "x");
    expect(total()).toBe("Total");
  });

  it("starts with a saved bill's total", async () => {
    api();
    renderApp(<BillForm record={BILL} onClose={vi.fn()} />);
    await ready();
    expect(field("Amount").value).toBe("1240.00");
    expect(field("Tax").value).toBe("110.05");
    expect(total()).toBe("Total$1,350.05");
  });
});

describe("checking before sending", () => {
  it("names every missing field in plain words", async () => {
    const calls = api();
    renderApp(<BillForm onClose={vi.fn()} />);
    await ready();
    await setDate("Bill date", "");
    await setDate("Due date", "");
    await save();
    expect(await alerts()).toEqual([
      "Choose a supplier",
      "Enter the bill number",
      "Choose a category",
      "Choose a bill date",
      "Choose a due date",
      "Enter an amount in dollars and cents, such as 49.50",
    ]);
    expect(sent(calls)).toEqual([]);
  });

  it.each(["-5", "12.345", "lots"])("refuses an amount of %s", async (amount) => {
    api();
    renderApp(<BillForm onClose={vi.fn()} />);
    await ready();
    await fillIn({ amount, tax: amount });
    await save();
    expect(await alerts()).toEqual([
      "Enter an amount in dollars and cents, such as 49.50",
      "Enter an amount in dollars and cents, such as 49.50",
    ]);
  });

  it("refuses a bill number over 50 characters", async () => {
    api();
    renderApp(<BillForm onClose={vi.fn()} />);
    await ready();
    await fillIn();
    await user().type(field("Bill number"), "x".repeat(43));
    await save();
    expect(await alerts()).toEqual(["Keep the bill number to 50 characters or fewer"]);
  });

  it.each([
    ["Due date", "2026-10-30", "The due date can't be before the bill date"],
    ["Paid on", "2026-11-01", "The paid date can't be in the future"],
    ["Paid on", "2026-10-30", "The paid date can't be before the bill date"],
  ])("refuses a %s of %s", async (label, value, message) => {
    const calls = api();
    renderApp(<BillForm onClose={vi.fn()} />);
    await ready();
    await fillIn();
    await setDate(label, value);
    await save();
    expect(await alerts()).toEqual([message]);
    expect(sent(calls)).toEqual([]);
  });

  it("checks the paid date against a bill date changed in the same save", async () => {
    api();
    renderApp(<BillForm record={{ ...BILL, paid_on: "2026-10-10" }} onClose={vi.fn()} />);
    await ready();
    await setDate("Bill date", "2026-10-20");
    await save();
    expect(await alerts()).toEqual(["The paid date can't be before the bill date"]);
  });
});

describe("the supplier picker", () => {
  it("can be searched, says when no organization matches, and offers no Add", async () => {
    api();
    renderApp(<BillForm onClose={vi.fn()} />);
    await ready();
    await user().click(screen.getByRole("combobox", { name: "Supplier" }));
    await user().type(screen.getByPlaceholderText("Search organizations"), "acme");
    expect(await screen.findByText("No organizations match.")).toBeTruthy();
    const list = within(screen.getByRole("listbox"));
    expect(list.queryAllByRole("option")).toEqual([]);
    expect(list.queryByText(/Add/)).toBeNull();
  });

  it("has the organization filled in on its page's Add bill", async () => {
    api();
    renderApp(<BillForm defaultOrganizationId={2} onClose={vi.fn()} />);
    await ready();
    expect(screen.getByRole("combobox", { name: "Supplier" }).textContent).toBe("Kingsgate Properties");
  });
});

describe("saving", () => {
  it("sends whole cents, no tax as 0, a blank paid date as null, and says so", async () => {
    const calls = api({ "POST /bills": () => ({ status: 201, body: BILL }) });
    const saved = vi.spyOn(toast, "success");
    const onClose = vi.fn();
    renderApp(<BillForm onClose={onClose} />);
    await ready();
    await fillIn({ amount: "$1,240" });
    await user().type(field("Notes"), "  Ten seats  ");
    await save();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent(calls)).toEqual([
      {
        method: "POST",
        path: "/bills",
        body: {
          organization_id: 1,
          bill_number: "INV-0042",
          category: "software",
          bill_date: "2026-10-31",
          due_date: "2026-11-30",
          amount_cents: 124000,
          tax_cents: 0,
          paid_on: null,
          notes: "Ten seats",
        },
      },
    ]);
    expect(saved).toHaveBeenCalledWith("Bill saved.");
  });

  it("sends an edit to the bill, with a paid date and cents in the tax", async () => {
    const calls = api({ "PATCH /bills/9": () => ({ body: BILL }) });
    const onClose = vi.fn();
    renderApp(<BillForm record={BILL} onClose={onClose} />);
    await ready();
    await user().clear(field("Tax"));
    await user().type(field("Tax"), "0.29");
    await setDate("Paid on", "2026-10-20");
    await save();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent(calls)[0]).toMatchObject({
      method: "PATCH",
      path: "/bills/9",
      body: { tax_cents: 29, amount_cents: 124000, paid_on: "2026-10-20", due_date: "2026-11-15" },
    });
  });

  it("clears a paid date as null, which marks the bill unpaid", async () => {
    const calls = api({ "PATCH /bills/9": () => ({ body: BILL }) });
    const onClose = vi.fn();
    renderApp(<BillForm record={{ ...BILL, paid_on: "2026-10-20" }} onClose={onClose} />);
    await ready();
    await setDate("Paid on", "");
    await save();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent(calls)[0].body).toMatchObject({ paid_on: null });
  });

  it("shows a number the supplier already has beside the number", async () => {
    api({
      "POST /bills": () => ({ status: 422, body: { detail: "Check the form.", fields: { bill_number: TAKEN } } }),
    });
    const onClose = vi.fn();
    renderApp(<BillForm onClose={onClose} />);
    await ready();
    await fillIn();
    await save();
    expect(await alerts()).toEqual([TAKEN]);
    expect(field("Bill number").getAttribute("aria-invalid")).toBe("true");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sends once however quickly Save is pressed", async () => {
    const calls = api({ "POST /bills": () => ({ status: 201, body: BILL }) });
    renderApp(<BillForm onClose={vi.fn()} />);
    await ready();
    await fillIn();
    const release = holdSaves();
    const button = screen.getByRole("button", { name: "Save bill" });
    await user().dblClick(button);
    release();
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
  });

  it("keeps what was typed when a save fails, and says so", async () => {
    api({ "POST /bills": () => ({ status: 500, body: { detail: "Something went wrong." } }) });
    const failure = vi.spyOn(toast, "error");
    const onClose = vi.fn();
    renderApp(<BillForm onClose={onClose} />);
    await ready();
    await fillIn({ tax: "110.05" });
    await save();
    await waitFor(() => expect(failure).toHaveBeenCalledWith("Something went wrong."));
    expect(onClose).not.toHaveBeenCalled();
    expect(field("Bill number").value).toBe("INV-0042");
    expect(field("Amount").value).toBe("1,240");
    expect(total()).toBe("Total$1,350.05");
  });

  it("closes and says so if the organizations can't be read", async () => {
    mockApi({ "GET /organizations": () => ({ status: 500, body: { detail: "Something went wrong." } }) });
    const failure = vi.spyOn(toast, "error");
    const onClose = vi.fn();
    renderApp(<BillForm onClose={onClose} />);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(failure).toHaveBeenCalledWith("Couldn't open the form. Try again.", { id: "form-unreadable" });
  });
});
