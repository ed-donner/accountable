import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { Toaster } from "sonner";
import { describe, expect, it } from "vitest";

import { queryDefaults } from "../lib/queryDefaults";
import { holdSaves, mockApi, user, type Call } from "../test-utils";
import { QuoteInvoiceButton, QuoteInvoiceLine } from "./QuoteInvoice";
import type { InvoiceRow } from "./queries";

const ROW: InvoiceRow = {
  id: 42,
  number: "INV-0042",
  issue_order: 42,
  shows_as: "issued",
  deal: { id: 12, name: "Harbor & Pine renewal" },
  organization: { id: 2, name: "Harbor & Pine" },
  bill_to: null,
  issue_date: "2026-11-05",
  due_date: "2026-12-05",
  total_cents: 100000,
  owed_cents: 100000,
  quote_id: 4,
};
const DRAFT_ROW: InvoiceRow = { ...ROW, id: 43, number: null, shows_as: "draft", issue_order: null };
const MADE = { ...DRAFT_ROW, quote: { id: 4, number: "QT-0004", tax_label: "Sales tax", tax_rate: "8.875" } };

type Props = { status?: string; dealStage?: string };

function Address() {
  return <output data-testid="address">{useLocation().pathname}</output>;
}

function show({ status = "accepted", dealStage = "won" }: Props = {}) {
  const props = { quoteId: 4, number: "QT-0004", status, dealStage };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <MemoryRouter initialEntries={["/quotes/4"]}>
        <Routes>
          <Route
            path="/quotes/4"
            element={
              <>
                <QuoteInvoiceButton {...props} />
                <dl>
                  <QuoteInvoiceLine {...props} />
                </dl>
              </>
            }
          />
          <Route path="/invoices/:id" element={<p>An invoice</p>} />
        </Routes>
        <Address />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const reads = (calls: Call[]) => calls.filter((call) => call.path === "/invoices?quote_id=4");
const createButton = () => screen.findByRole("button", { name: "Create invoice" });

describe("Create invoice", () => {
  it("is on an accepted quote that has none, and makes one and opens it", async () => {
    let made = false;
    const calls = mockApi({
      "GET /invoices?quote_id=4": () => ({ body: made ? [DRAFT_ROW] : [] }),
      "POST /invoices/from-quote/4": () => {
        made = true;
        return { status: 201, body: MADE };
      },
      "GET /invoices/43": MADE,
    });
    show();
    await user().click(await createButton());
    expect(await screen.findByText("Invoice created from QT-0004.")).toBeTruthy();
    expect(screen.getByTestId("address").textContent).toBe("/invoices/43");
    expect(calls.filter((call) => call.method === "POST")).toEqual([
      { method: "POST", path: "/invoices/from-quote/4", body: {} },
    ]);
  });

  it.each(["draft", "sent", "expired", "declined"])("is not on a %s quote", async (status) => {
    const calls = mockApi({ "GET /invoices?quote_id=4": [] });
    show({ status });
    await waitFor(() => expect(reads(calls).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is off, with the reason beside it, while the deal isn't won", async () => {
    mockApi({ "GET /invoices?quote_id=4": [] });
    show({ dealStage: "negotiation" });
    const button = (await createButton()) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Move the deal back to Won to invoice this quote.")).toBeTruthy();
  });

  it("is off while the request is on its way, and two presses make one request", async () => {
    const calls = mockApi({
      "GET /invoices?quote_id=4": [],
      "POST /invoices/from-quote/4": MADE,
      "GET /invoices/43": MADE,
    });
    const release = holdSaves();
    show();
    const button = (await createButton()) as HTMLButtonElement;
    await user().dblClick(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    release();
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("/invoices/43"));
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("reads again when the quote already has an invoice, and shows Open invoice with the message", async () => {
    let theirs = false;
    const calls = mockApi({
      "GET /invoices?quote_id=4": () => ({ body: theirs ? [ROW] : [] }),
      "POST /invoices/from-quote/4": () => {
        theirs = true;
        return { status: 409, body: { detail: "QT-0004 already has an invoice, INV-0042." } };
      },
    });
    show();
    await user().click(await createButton());
    expect(await screen.findByText("QT-0004 already has an invoice, INV-0042.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Open invoice" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create invoice" })).toBeNull();
    expect(reads(calls)).toHaveLength(2);
  });
});

describe("Open invoice and the invoice line", () => {
  it("open an issued invoice, named by its number", async () => {
    const calls = mockApi({ "GET /invoices?quote_id=4": [ROW] });
    show();
    const link = await screen.findByRole("link", { name: "INV-0042" });
    expect(link.getAttribute("href")).toBe("/invoices/42");
    expect(screen.getByText("Invoice")).toBeTruthy();
    expect(reads(calls)).toHaveLength(1);
    await user().click(await screen.findByRole("button", { name: "Open invoice" }));
    expect(screen.getByTestId("address").textContent).toBe("/invoices/42");
  });

  it("call a draft one a draft", async () => {
    mockApi({ "GET /invoices?quote_id=4": [DRAFT_ROW] });
    show();
    expect((await screen.findByRole("link", { name: "Draft" })).getAttribute("href")).toBe("/invoices/43");
    expect(screen.getByRole("button", { name: "Open invoice" })).toBeTruthy();
  });

  it("show no line on a quote without an invoice", async () => {
    const calls = mockApi({ "GET /invoices?quote_id=4": [] });
    show();
    await createButton();
    expect(screen.queryByText("Invoice")).toBeNull();
    expect(reads(calls)).toHaveLength(1);
  });

  it("say a failed read once, with Try again, and Create invoice waits for it", async () => {
    let failing = true;
    mockApi({
      "GET /invoices?quote_id=4": () => (failing ? { status: 500, body: { detail: "Broken" } } : { body: [ROW] }),
    });
    show();
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Create invoice" }) as HTMLButtonElement).disabled).toBe(true);
    failing = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Open invoice" })).toBeTruthy();
  });
});
