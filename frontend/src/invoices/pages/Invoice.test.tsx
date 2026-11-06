import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import totalsCases from "../../../../shared/totals-cases.json";
import type { CompanySettings } from "../../company/settings";
import { todayIso } from "../../lib/dates";
import { queryDefaults } from "../../lib/queryDefaults";
import { holdSaves, mockApi, user, type Call } from "../../test-utils";
import { entriesReply, entry } from "../../books/test-books";
import type { DraftRequest, InvoiceDetail, InvoiceLine } from "../queries";
import { Invoice } from "./Invoice";

afterEach(() => vi.useRealTimers());

const ALEX = { id: "teammate-alex-rivera", name: "Alex Rivera" };
const DANA = { id: "teammate-dana-whitfield", name: "Dana Whitfield" };

const SETTINGS: CompanySettings = {
  company_name: "Plainsong Systems",
  address: "48 Orchard Row",
  email: "accounts@plainsong.example",
  phone: null,
  tax_label: "Sales tax",
  tax_rate: "8.875",
  payment_terms_days: 30,
  quote_prefix: "QT-",
  invoice_prefix: "INV-",
  invoice_design: "classic",
  accent_color: "#0E6B6B",
  logo: null,
  opening_balance_cents: null,
  opening_balance_on: null,
  updated_at: "2026-11-01T12:00:00Z",
  updated_by: DANA,
};

function line(id: number, changes: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    id,
    product_id: id,
    name: `Product ${id}`,
    description: null,
    quantity: 1,
    unit_price_cents: 10000,
    amount_cents: 10000,
    ...changes,
  };
}

const DRAFT: InvoiceDetail = {
  id: 7,
  number: null,
  issue_order: null,
  shows_as: "draft",
  status: "draft",
  deal: { id: 3, name: "Annual support" },
  organization: { id: 2, name: "Harbor & Pine" },
  bill_to: "Harbor & Pine\nAttn: Sam Carter",
  issue_date: null,
  due_date: null,
  total_cents: 0,
  owed_cents: 0,
  quote_id: null,
  quote: null,
  days_late: null,
  deal_stage: "won",
  company: { name: "Plainsong Systems", address: "48 Orchard Row", email: null, phone: null },
  tax_label: "Sales tax",
  tax_rate: "8.875",
  lines: [line(1, { name: "Annual support plan", description: "Weekdays, 9 to 5." }), line(2), line(3)],
  subtotal_cents: 30000,
  tax_cents: 2663,
  paid_cents: 0,
  payments: [],
  issued_by: null,
  voided_by: null,
  voided_at: null,
  created_at: "2026-10-30T12:00:00Z",
  created_by: ALEX,
  updated_at: "2026-10-30T12:00:00Z",
  updated_by: ALEX,
};

const ISSUED: InvoiceDetail = {
  ...DRAFT,
  number: "INV-0042",
  issue_order: 42,
  shows_as: "part_paid",
  status: "issued",
  issue_date: "2026-10-01",
  due_date: "2026-10-31",
  total_cents: 125000,
  subtotal_cents: 125000,
  tax_cents: 0,
  owed_cents: 50000,
  paid_cents: 75000,
  lines: [line(1, { quantity: 1, unit_price_cents: 125000, amount_cents: 125000 })],
  payments: [
    {
      id: 3,
      paid_on: "2026-10-20",
      amount_cents: 75000,
      method: "bank_transfer",
      reference: "Wire 4471",
      created_at: "2026-10-20T15:00:00Z",
      created_by: ALEX,
    },
  ],
  issued_by: DANA,
};

const PRODUCTS = [
  { id: 1, name: "Annual support plan", description: "Weekdays.", unit_price_cents: 360000, active: true },
  { id: 9, name: "Label printer", description: null, unit_price_cents: 28995, active: false },
  { id: 10, name: "Training day, on site", description: "Up to 12 people.", unit_price_cents: 125000, active: true },
];

/**
 * The invoice as the stand-in backend has it. A write's reply becomes it, as the page reads
 * everything again after a write and would otherwise get the old one.
 */
let current: InvoiceDetail;

/** A write that leaves the invoice as given, and replies with it. */
function leaves(next: InvoiceDetail, status = 200) {
  return () => {
    current = next;
    return { status, body: next };
  };
}

function open(invoice: InvoiceDetail, routes: Record<string, unknown> = {}, settings = SETTINGS) {
  current = invoice;
  const calls = mockApi({
    "GET /invoices/7": () => ({ body: current }),
    "GET /settings": settings,
    "GET /products": PRODUCTS,
    ...routes,
  });
  const router = createMemoryRouter(
    [
      { path: "/invoices/:id", element: <Invoice /> },
      { path: "/invoices", element: <p>The Invoices table</p> },
    ],
    { initialEntries: ["/invoices/7"] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { calls, router };
}

const sent = (calls: Call[], method: string) => calls.filter((call) => call.method === method);
const button = (name: string | RegExp) => screen.getByRole("button", { name });

async function draftPage(invoice = DRAFT, routes: Record<string, unknown> = {}, settings = SETTINGS) {
  const opened = open(invoice, routes, settings);
  await screen.findByRole("heading", { level: 1, name: "Draft invoice" });
  return opened;
}

function lineCards() {
  return screen.getAllByTestId("draft-line").map((card) => within(card));
}

async function retype(box: HTMLElement, text: string) {
  await user().clear(box);
  if (text) await user().type(box, text);
}

function figures() {
  return within(screen.getByTestId("draft-figures"))
    .getAllByRole("definition")
    .map((figure) => figure.textContent);
}

describe("a draft's page", () => {
  it("has the Bill to, the lines with their amounts, and who added it, beside a preview marked DRAFT", async () => {
    await draftPage();
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Bill to" }).value).toBe(
      "Harbor & Pine\nAttn: Sam Carter",
    );
    expect(lineCards().map((card) => card.getByText(/^Product|^Annual/).textContent)).toEqual([
      "Annual support plan",
      "Product 2",
      "Product 3",
    ]);
    expect(screen.getAllByTestId("line-amount").map((amount) => amount.textContent)).toEqual([
      "$100.00",
      "$100.00",
      "$100.00",
    ]);
    expect(screen.getByText(/^Added by Alex Rivera on/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Invoice preview, page 1 of 1" }).textContent).toContain("DRAFT");
  });

  const CASES = totalsCases.filter((item) => item.lines.length > 0 && item.lines.length <= 3).slice(0, 4);

  it.each(CASES.map((item) => [item.why, item] as const))(
    "works the figures out as they're typed, as the backend does: %s",
    async (_why, item) => {
      const lines = item.lines.map((_line, index) => line(index + 1));
      await draftPage({ ...DRAFT, lines, tax_rate: item.rate });
      for (const [index, [quantity, cents]] of item.lines.entries()) {
        const card = lineCards()[index];
        await retype(card.getByLabelText("Quantity"), String(quantity));
        await retype(card.getByLabelText("Unit price"), (cents / 100).toFixed(2));
      }
      const dollars = (cents: number) =>
        `$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
      expect(figures()).toEqual([dollars(item.subtotal), dollars(item.tax), dollars(item.total)]);
    },
  );

  it("has no Accounting panel, because a draft posts nothing", async () => {
    await draftPage();
    expect(screen.queryByRole("region", { name: "Accounting" })).toBeNull();
  });

  it("adds a line from the active products only, taking its name, price and description", async () => {
    await draftPage({ ...DRAFT, lines: [] });
    await user().click(button("Add line"));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["Annual support plan$3,600.00", "Training day, on site$1,250.00"]);
    await user().click(screen.getByRole("option", { name: /Training day/ }));
    const [card] = lineCards();
    expect(card.getByText("Training day, on site")).toBeTruthy();
    expect(card.getByLabelText<HTMLTextAreaElement>("Description").value).toBe("Up to 12 people.");
    expect(card.getByLabelText<HTMLInputElement>("Quantity").value).toBe("1");
    expect(card.getByLabelText<HTMLInputElement>("Unit price").value).toBe("1250.00");
  });

  it("says when the products couldn't be read, rather than loading for ever, and Try again reads them", async () => {
    let reads = 0;
    await draftPage(
      { ...DRAFT, lines: [] },
      {
        "GET /products": () => {
          reads += 1;
          return reads === 1 ? { status: 500, body: { detail: "Something went wrong." } } : { body: PRODUCTS };
        },
      },
    );
    await user().click(button("Add line"));
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    expect(screen.queryByText("Loading products")).toBeNull();
    await user().click(button("Try again"));
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    expect(screen.queryByText("Couldn't load this.")).toBeNull();
  });

  it("removes a line", async () => {
    await draftPage();
    await user().click(button("Remove Product 2"));
    expect(lineCards()).toHaveLength(2);
  });

  it.each([
    ["Quantity", "0", "Enter a whole number from 1 to 1,000,000"],
    ["Quantity", "1.5", "Enter a whole number from 1 to 1,000,000"],
    ["Unit price", "4.999", "Enter a price in dollars and cents, such as 49.50"],
    ["Description", "x".repeat(1001), "Keep the description to 1,000 characters or fewer"],
    ["Description", "Setup \u{1F600}", 'Invoices can\'t show "\u{1F600}". Take it out to save'],
  ])("refuses a line's %s of %j beside it, before sending anything", async (label, typed, message) => {
    const { calls } = await draftPage();
    const box = lineCards()[1].getByLabelText(label);
    if (typed.length > 100) fireEvent.change(box, { target: { value: typed } });
    else await retype(box, typed);
    await user().click(button("Save draft"));
    expect(await lineCards()[1].findByText(message)).toBeTruthy();
    expect(sent(calls, "PATCH")).toEqual([]);
  });

  it.each([
    ["Line\n".repeat(6) + "Line", "Keep the Bill to to 6 lines and 500 characters"],
    ["x".repeat(501), "Keep the Bill to to 6 lines and 500 characters"],
    ["Acme 漢 and ي", 'Invoices can\'t show "漢" and "ي". Take them out to save'],
    ["Acme\tCo", "Invoices can't show a tab. Take it out to save"],
  ])("refuses a Bill to of %j beside it, before sending anything", async (typed, message) => {
    const { calls } = await draftPage();
    fireEvent.change(screen.getByRole("textbox", { name: "Bill to" }), { target: { value: typed } });
    await user().click(button("Save draft"));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(sent(calls, "PATCH")).toEqual([]);
  });

  it("says a line whose product's name the fonts lack must be removed, beside the line", async () => {
    await draftPage({ ...DRAFT, lines: [line(1, { name: "漢 license" })] });
    await user().click(button("Save draft"));
    expect(
      await lineCards()[0].findByText(
        'Invoices can\'t show "漢". Remove this line, rename the product and add it again',
      ),
    ).toBeTruthy();
  });

  it("refuses a subtotal over $1 trillion", async () => {
    const { calls } = await draftPage({ ...DRAFT, lines: [line(1)] });
    await retype(lineCards()[0].getByLabelText("Quantity"), "1000000");
    await retype(lineCards()[0].getByLabelText("Unit price"), "1000000.01");
    await user().click(button("Save draft"));
    expect(await screen.findByText("Keep the subtotal to $1 trillion or less")).toBeTruthy();
    expect(sent(calls, "PATCH")).toEqual([]);
  });

  it("refuses more than 100 lines", async () => {
    const many = Array.from({ length: 101 }, (_, index) => line(index + 1));
    const { calls } = await draftPage({ ...DRAFT, lines: many });
    await user().click(button("Save draft"));
    expect(await screen.findByText("An invoice can have up to 100 lines")).toBeTruthy();
    expect(sent(calls, "PATCH")).toEqual([]);
  });

  it("saves the Bill to and every line, once however quickly Save draft is pressed, and says so", async () => {
    const saved = { ...DRAFT, bill_to: "Harbor & Pine Ltd", updated_by: DANA };
    const said = vi.spyOn(toast, "success");
    const { calls } = await draftPage(DRAFT, { "PATCH /invoices/7": leaves(saved) });
    await retype(screen.getByRole("textbox", { name: "Bill to" }), "Harbor & Pine Ltd");
    await retype(lineCards()[1].getByLabelText("Quantity"), "3");
    const release = holdSaves();
    fireEvent.click(button("Save draft"));
    fireEvent.click(button("Save draft"));
    release();
    await waitFor(() => expect(said).toHaveBeenCalledWith("Draft saved."));
    expect(sent(calls, "PATCH")).toHaveLength(1);
    expect(sent(calls, "PATCH")[0].body).toEqual({
      bill_to: "Harbor & Pine Ltd",
      lines: [
        { id: 1, product_id: 1, description: "Weekdays, 9 to 5.", quantity: 1, unit_price_cents: 10000 },
        { id: 2, product_id: 2, description: null, quantity: 3, unit_price_cents: 10000 },
        { id: 3, product_id: 3, description: null, quantity: 1, unit_price_cents: 10000 },
      ],
    });
  });

  it("gives a new line the id its save gave it, keeping what was typed while the save was on its way", async () => {
    const added = line(99, { product_id: 10, name: "Training day, on site", description: "Up to 12 people." });
    const saved = { ...DRAFT, lines: [...DRAFT.lines, { ...added, unit_price_cents: 125000, amount_cents: 125000 }] };
    const said = vi.spyOn(toast, "success");
    const { calls } = await draftPage(DRAFT, { "PATCH /invoices/7": leaves(saved) });
    await user().click(button("Add line"));
    await user().click(await screen.findByRole("option", { name: /Training day/ }));
    const release = holdSaves();
    await user().click(button("Save draft"));
    await retype(screen.getByRole("textbox", { name: "Bill to" }), "Harbor & Pine Ltd");
    release();
    await waitFor(() => expect(said).toHaveBeenCalledWith("Draft saved."));
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Bill to" }).value).toBe("Harbor & Pine Ltd");
    await user().click(button("Save draft"));
    await waitFor(() => expect(sent(calls, "PATCH")).toHaveLength(2));
    const [first, second] = sent(calls, "PATCH").map((call) => (call.body as DraftRequest).lines[3]);
    expect([first.id, second.id]).toEqual([undefined, 99]);
    expect((sent(calls, "PATCH")[1].body as DraftRequest).bill_to).toBe("Harbor & Pine Ltd");
  });

  it("puts the backend's message beside a line's field, and keeps what was typed", async () => {
    await draftPage(DRAFT, {
      "PATCH /invoices/7": () => ({
        status: 422,
        body: { detail: "Check the form.", fields: { "lines.2.quantity": "Enter a whole number from 1 to 1,000,000" } },
      }),
    });
    await retype(lineCards()[2].getByLabelText("Quantity"), "5");
    await user().click(button("Save draft"));
    expect(await lineCards()[2].findByText("Enter a whole number from 1 to 1,000,000")).toBeTruthy();
    expect(lineCards()[2].getByLabelText<HTMLInputElement>("Quantity").value).toBe("5");
  });

  it("asks before leaving with changes, Stay keeps them and Leave goes", async () => {
    const { router } = await draftPage();
    await user().type(screen.getByRole("textbox", { name: "Bill to" }), " Ltd");
    await act(() => router.navigate("/invoices"));
    const question = await screen.findByRole("alertdialog", { name: "Leave without saving?" });
    expect(within(question).getByText("Your changes to this draft will be lost.")).toBeTruthy();
    await user().click(within(question).getByRole("button", { name: "Stay" }));
    expect(router.state.location.pathname).toBe("/invoices/7");
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Bill to" }).value).toMatch(/ Ltd$/);

    await act(() => router.navigate("/invoices"));
    await user().click(await screen.findByRole("button", { name: "Leave" }));
    expect(await screen.findByText("The Invoices table")).toBeTruthy();
  });

  it("keeps what was typed, and the question before leaving, when the day changes and the draft is read again", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 5, 23, 59) });
    let reads = 0;
    const { router } = await draftPage(DRAFT, {
      "GET /invoices/7": () => {
        reads += 1;
        // A teammate's save shows, so the test can tell the new read has arrived.
        return { body: reads === 1 ? DRAFT : { ...DRAFT, updated_at: "2026-11-06T00:00:30Z", updated_by: DANA } };
      },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Bill to" }), {
      target: { value: "Unsaved customer address" },
    });
    vi.setSystemTime(new Date(2026, 10, 6, 0, 1));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(await screen.findByText(/^Last changed by Dana Whitfield on/)).toBeTruthy();
    expect(reads).toBe(2);
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Bill to" }).value).toBe(
      "Unsaved customer address",
    );
    await act(() => router.navigate("/invoices"));
    expect(await screen.findByRole("alertdialog", { name: "Leave without saving?" })).toBeTruthy();
  });

  it("never shows one invoice while another is being read", async () => {
    const { router } = await draftPage(DRAFT, { "GET /invoices/8": { ...ISSUED, id: 8, number: "INV-0050" } });
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.endsWith("/invoices/8")) await held;
      return answer(url, init);
    });
    await act(() => router.navigate("/invoices/8"));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 1, name: "Draft invoice" })).toBeNull());
    release();
    expect(await screen.findByRole("heading", { level: 1, name: "INV-0050" })).toBeTruthy();
  });

  it("leaves without asking when nothing has changed", async () => {
    const { router } = await draftPage();
    await act(() => router.navigate("/invoices"));
    expect(await screen.findByText("The Invoices table")).toBeTruthy();
  });

  it("asks before issuing, then shows the invoice with its number", async () => {
    const issued = { ...ISSUED, shows_as: "issued" as const, paid_cents: 0, owed_cents: 125000, payments: [] };
    const { calls } = await draftPage(DRAFT, { "POST /invoices/7/issue": leaves(issued) });
    await user().click(button("Issue invoice"));
    const question = await screen.findByRole("alertdialog", { name: "Issue this invoice?" });
    expect(within(question).getByText("Once it's issued, it can't be changed.")).toBeTruthy();
    await user().click(within(question).getByRole("button", { name: "Issue invoice" }));
    expect(await screen.findByRole("heading", { level: 1, name: "INV-0042" })).toBeTruthy();
    expect(sent(calls, "POST")[0].path).toBe("/invoices/7/issue");
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
  });

  it.each([
    [
      "the deal has no organization",
      { organization: null },
      SETTINGS,
      "This deal has no organization. Choose one on the deal before issuing.",
    ],
    [
      "no company name is saved",
      {},
      { ...SETTINGS, company_name: null },
      "Enter the company's name in Company settings before issuing.",
    ],
    [
      "the address has a character the fonts lack",
      {},
      { ...SETTINGS, address: "48 Orchard Row 漢" },
      'The address in Company settings has "漢", which invoices can\'t show. Change it there before issuing.',
    ],
    [
      "the total is $0.00",
      { lines: [line(1, { unit_price_cents: 0 })] },
      SETTINGS,
      "The total must be more than $0.00 to issue.",
    ],
  ])("refuses to issue when %s, at the top, before sending", async (_when, changes, settings, message) => {
    const { calls } = await draftPage({ ...DRAFT, ...changes }, {}, settings);
    await user().click(button("Issue invoice"));
    expect((await screen.findAllByRole("alert")).map((alert) => alert.textContent)).toContain(message);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(sent(calls, "POST")).toEqual([]);
  });

  it("refuses to issue with no Bill to and no lines, beside them", async () => {
    await draftPage({ ...DRAFT, bill_to: null, lines: [] });
    await user().click(button("Issue invoice"));
    expect(await screen.findByText("Enter who the invoice is for")).toBeTruthy();
    expect(screen.getByText("Add a line before issuing")).toBeTruthy();
  });

  it("shows the backend's refusal of the whole draft at the top", async () => {
    await draftPage(DRAFT, {
      "POST /invoices/7/issue": () => ({
        status: 422,
        body: {
          detail: "Check the form.",
          fields: { form: "Enter the company's name in Company settings before issuing." },
        },
      }),
    });
    await user().click(button("Issue invoice"));
    await user().click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Issue invoice" }));
    expect(await screen.findByText("Enter the company's name in Company settings before issuing.")).toBeTruthy();
  });

  it("reads the invoice again when a teammate has issued it meanwhile", async () => {
    const failed = vi.spyOn(toast, "error");
    await draftPage(DRAFT, {
      "PATCH /invoices/7": () => {
        current = ISSUED;
        return { status: 409, body: { detail: "This invoice has been issued, so it can't be changed." } };
      },
    });
    await user().type(screen.getByRole("textbox", { name: "Bill to" }), " Ltd");
    await user().click(button("Save draft"));
    await waitFor(() => expect(failed).toHaveBeenCalledWith("This invoice has been issued, so it can't be changed."));
    expect(await screen.findByRole("heading", { level: 1, name: "INV-0042" })).toBeTruthy();
  });

  it("asks before deleting the draft, then goes back to Invoices", async () => {
    const { calls } = await draftPage(DRAFT, { "DELETE /invoices/7": () => ({ status: 204, body: null }) });
    await user().type(screen.getByRole("textbox", { name: "Bill to" }), " changed");
    await user().click(button("Delete draft"));
    const question = await screen.findByRole("alertdialog", { name: "Delete this draft?" });
    await user().click(within(question).getByRole("button", { name: "Delete draft" }));
    expect(await screen.findByText("The Invoices table")).toBeTruthy();
    expect(sent(calls, "DELETE")).toEqual([{ method: "DELETE", path: "/invoices/7", body: undefined }]);
  });
});

async function issuedPage(invoice: InvoiceDetail = ISSUED, routes: Record<string, unknown> = {}) {
  const opened = open(invoice, routes);
  await screen.findByRole("heading", { level: 1, name: invoice.number! });
  return opened;
}

describe("an issued invoice's page", () => {
  it("has no way to change it", async () => {
    await issuedPage();
    expect(screen.queryByRole("textbox")).toBeNull();
    for (const name of ["Save draft", "Issue invoice", "Delete draft", "Add line"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("shows its total, the bar of paid and owed, its dates and who issued it", async () => {
    await issuedPage();
    expect(screen.getByTestId("invoice-total").textContent).toBe("$1,250.00");
    expect(screen.getByRole("img", { name: "$750.00 paid and $500.00 owed" })).toBeTruthy();
    expect(screen.getByText("$750.00 paid")).toBeTruthy();
    expect(screen.getByText("$500.00 owed")).toBeTruthy();
    expect(screen.getByText(/^Issued by Dana Whitfield on/).textContent).toBe(
      "Issued by Dana Whitfield on Oct 1, 2026",
    );
  });

  it("says how many days late an overdue invoice is", async () => {
    await issuedPage({ ...ISSUED, shows_as: "overdue", days_late: 12 });
    expect(screen.getByText("12 days late")).toBeTruthy();
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
  });

  it("lists each payment with who recorded it, and asks before deleting one", async () => {
    const { calls } = await issuedPage(ISSUED, {
      "DELETE /invoices/7/payments/3": leaves({
        ...ISSUED,
        payments: [],
        paid_cents: 0,
        owed_cents: 125000,
        shows_as: "issued",
      }),
    });
    const [payment] = screen.getAllByTestId("payment");
    expect(payment.textContent).toContain("Wire 4471");
    expect(within(payment).getByText(/^Recorded by Alex Rivera on/)).toBeTruthy();
    await user().click(button("Delete payment of $750.00"));
    const question = await screen.findByRole("alertdialog", { name: "Delete this payment of $750.00?" });
    expect(within(question).getByText("What's owed goes back up to $1,250.00.")).toBeTruthy();
    await user().click(within(question).getByRole("button", { name: "Delete payment" }));
    expect(await screen.findByText("No payments yet.")).toBeTruthy();
    expect(sent(calls, "DELETE")[0].path).toBe("/invoices/7/payments/3");
  });

  it("has an Accounting panel at the foot of the left column with the invoice's own entries", async () => {
    const { calls } = await issuedPage(ISSUED, {
      "GET /books/entries?kind=invoice&source_id=7&limit=500": entriesReply([
        entry({ description: "Invoice INV-0042 issued" }),
      ]),
    });
    const panel = screen.getByRole("region", { name: "Accounting" });
    expect(await within(panel).findByRole("article")).toBeTruthy();
    const payments = screen.getByRole("region", { name: "Payments" });
    expect(payments.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A payment has its own button, and its entries are not read until it is opened.
    expect(calls.some((call) => call.path.includes("kind=payment"))).toBe(false);
  });

  it("says a void invoice's entries include the reversal", async () => {
    await issuedPage(
      { ...ISSUED, status: "void", shows_as: "void", payments: [], paid_cents: 0, owed_cents: 0 },
      {
        "GET /books/entries?kind=invoice&source_id=7&limit=500": entriesReply([
          entry({ id: 1, reversed_by_id: 2 }),
          entry({ id: 2, reverses_id: 1, description: "Invoice INV-0042 voided" }),
        ]),
      },
    );
    const panel = screen.getByRole("region", { name: "Accounting" });
    expect(await within(panel).findAllByRole("article")).toHaveLength(2);
    expect(within(panel).getByText("Reversal")).toBeTruthy();
  });

  it("opens a payment's entries under its row from the Accounting button, and closes them again", async () => {
    await issuedPage(ISSUED, {
      "GET /books/entries?kind=invoice&source_id=7&limit=500": entriesReply([]),
      "GET /books/entries?kind=payment&source_id=3&limit=500": entriesReply([
        entry({ description: "Payment received on INV-0042" }),
      ]),
    });
    const [payment] = screen.getAllByTestId("payment");
    const open = within(payment).getByRole("button", { name: "Accounting for payment of $750.00" });
    expect(open.getAttribute("aria-expanded")).toBe("false");
    await user().click(open);
    expect(await within(payment).findByRole("article")).toBeTruthy();
    expect(open.getAttribute("aria-expanded")).toBe("true");
    await user().click(open);
    expect(within(payment).queryByRole("article")).toBeNull();
  });

  it("offers Void only with no payments", async () => {
    await issuedPage();
    expect(screen.queryByRole("button", { name: "Void" })).toBeNull();
  });

  it("voids an invoice with no payments after asking", async () => {
    const fresh = { ...ISSUED, payments: [], paid_cents: 0, owed_cents: 125000, shows_as: "issued" as const };
    const { calls } = await issuedPage(fresh, {
      "POST /invoices/7/void": leaves({
        ...fresh,
        status: "void",
        shows_as: "void",
        owed_cents: 0,
        voided_by: ALEX,
        voided_at: "2026-11-01T12:00:00Z",
      }),
    });
    await user().click(button("Void"));
    const question = await screen.findByRole("alertdialog", { name: "Void INV-0042?" });
    expect(within(question).getByText("It keeps its number and is marked VOID. This can't be undone.")).toBeTruthy();
    await user().click(within(question).getByRole("button", { name: "Void" }));
    expect(await screen.findByText(/^Voided by Alex Rivera on/)).toBeTruthy();
    expect(sent(calls, "POST")[0].path).toBe("/invoices/7/void");
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
  });

  it("downloads the PDF under its number", async () => {
    const { calls } = await issuedPage();
    const saved: string[] = [];
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:pdf", revokeObjectURL: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    mockApi({ "GET /invoices/7/pdf": {} });
    await user().click(button("Download PDF"));
    await waitFor(() => expect(saved).toEqual(["INV-0042.pdf"]));
    expect(calls).toBeDefined();
  });
});

describe("recording a payment", () => {
  async function form(routes: Record<string, unknown> = {}) {
    const opened = await issuedPage(ISSUED, routes);
    await user().click(button("Record payment"));
    const dialog = within(await screen.findByRole("dialog", { name: "Record payment" }));
    return { ...opened, dialog };
  }

  it("starts with today, what's owed and Bank transfer", async () => {
    const { dialog } = await form();
    expect(dialog.getByLabelText<HTMLInputElement>("Date").value).toBe(todayIso());
    expect(dialog.getByLabelText<HTMLInputElement>("Amount").value).toBe("500.00");
    expect(dialog.getByLabelText<HTMLSelectElement>("Method").value).toBe("bank_transfer");
  });

  it.each([
    ["Date", "", "Enter the date it was paid"],
    ["Date", "2999-01-01", "A payment can't be dated in the future"],
    ["Date", "2026-09-30", "A payment can't be dated before the invoice was issued"],
    ["Amount", "0", "Enter an amount more than $0.00"],
    ["Amount", "abc", "Enter an amount more than $0.00"],
    ["Amount", "500.01", "That's more than the $500.00 still owed"],
    ["Reference", "x".repeat(101), "Keep the reference to 100 characters or fewer"],
  ])("refuses a %s of %j with its message, sending nothing", async (label, typed, message) => {
    const { dialog, calls } = await form();
    fireEvent.change(dialog.getByLabelText(label), { target: { value: typed } });
    await user().click(dialog.getByRole("button", { name: "Record payment" }));
    expect(await dialog.findByText(message)).toBeTruthy();
    expect(sent(calls, "POST")).toEqual([]);
  });

  it("records it and shows the invoice paid", async () => {
    const paid = { ...ISSUED, shows_as: "paid" as const, owed_cents: 0, paid_cents: 125000 };
    const said = vi.spyOn(toast, "success");
    const { dialog, calls } = await form({ "POST /invoices/7/payments": leaves(paid, 201) });
    await user().selectOptions(dialog.getByLabelText("Method"), "check");
    await user().type(dialog.getByLabelText("Reference"), "Check 1182");
    await user().click(dialog.getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(said).toHaveBeenCalledWith("Payment recorded."));
    expect(sent(calls, "POST")[0].body).toEqual({
      paid_on: todayIso(),
      amount_cents: 50000,
      method: "check",
      reference: "Check 1182",
    });
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
  });

  it("takes the largest balance there can be, a $1 trillion subtotal with tax at 100%, in one payment", async () => {
    const most = 200_000_000_000_000;
    const owing = { ...ISSUED, total_cents: most, owed_cents: most, paid_cents: 0, payments: [] };
    const paid = { ...owing, shows_as: "paid" as const, owed_cents: 0, paid_cents: most };
    const opened = await issuedPage(owing, { "POST /invoices/7/payments": leaves(paid, 201) });
    await user().click(button("Record payment"));
    const dialog = within(await screen.findByRole("dialog", { name: "Record payment" }));
    expect(dialog.getByLabelText<HTMLInputElement>("Amount").value).toBe("2000000000000.00");
    await user().click(dialog.getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(sent(opened.calls, "POST")[0]?.body).toMatchObject({ amount_cents: most }));
  });
});

describe("an invoice's address", () => {
  it("says an invoice that no longer exists does, with a link back to Invoices", async () => {
    open(DRAFT, { "GET /invoices/7": () => ({ status: 404, body: { detail: "Invoice not found" } }) });
    expect(await screen.findByRole("heading", { level: 1, name: "This invoice no longer exists" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Invoices" })).toBeTruthy();
  });
});

describe("an invoice made from a quote", () => {
  const QUOTE = { id: 4, number: "QT-0004", tax_label: "Sales tax", tax_rate: "8.875" };
  const FROM_QUOTE: InvoiceDetail = { ...DRAFT, quote: QUOTE, quote_id: 4 };
  const NOTICE =
    "QT-0004 was priced with Sales tax at 8.875%. Company settings now say 10%, so this draft's tax is worked out at 10%.";

  it.each([
    ["a draft", FROM_QUOTE],
    ["an issued invoice", { ...ISSUED, quote: QUOTE, quote_id: 4 }],
    ["a void one", { ...ISSUED, quote: QUOTE, quote_id: 4, status: "void" as const, shows_as: "void" as const }],
  ])("says where it is from on %s, linking to the quote", async (_name, invoice) => {
    open(invoice);
    const link = await screen.findByRole("link", { name: "From quote QT-0004" });
    expect(link.getAttribute("href")).toBe("/quotes/4");
  });

  it("says nothing of a quote on an invoice that wasn't made from one", async () => {
    await draftPage();
    expect(screen.queryByText(/From quote/)).toBeNull();
    expect(screen.queryByText(/was priced with/)).toBeNull();
  });

  it("gives a notice with the quote's label and both rates while they differ", async () => {
    await draftPage({ ...FROM_QUOTE, tax_rate: "10" });
    expect((await screen.findByRole("status")).textContent).toBe(NOTICE);
  });

  it("gives no notice when the rates match", async () => {
    await draftPage(FROM_QUOTE);
    expect(screen.queryByText(/was priced with/)).toBeNull();
  });

  it("gives no notice for a label change alone", async () => {
    await draftPage({ ...FROM_QUOTE, tax_label: "VAT" });
    expect(screen.queryByText(/was priced with/)).toBeNull();
  });

  it("gives no notice once issued, which keeps the rate it was issued at", async () => {
    await issuedPage({ ...ISSUED, quote: QUOTE, quote_id: 4, tax_rate: "10" });
    expect(screen.queryByText(/was priced with/)).toBeNull();
  });

  it("shows a field that breaks the rules at once, as the quote had it", async () => {
    const long = "x".repeat(1500);
    await draftPage({ ...FROM_QUOTE, lines: [line(1, { description: long }), line(2)] });
    expect(await screen.findByText("Keep the description to 1,000 characters or fewer")).toBeTruthy();
    expect(screen.getAllByTestId("draft-line")).toHaveLength(2);
  });
});
