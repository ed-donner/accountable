import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockApi, renderApp, user } from "../test-utils";
import { AccountingPanel } from "./AccountingPanel";
import { entriesReply, entry } from "./test-books";

const INVOICE_7 = "GET /books/entries?kind=invoice&source_id=7&limit=500";

describe("the Accounting panel", () => {
  it("shows the record's entries oldest first, each as in the Journal but without who made it", async () => {
    mockApi({
      [INVOICE_7]: entriesReply([
        entry({ id: 1, reversed_by_id: 2 }),
        entry({ id: 2, reverses_id: 1, description: "Invoice INV-0007 voided" }),
      ]),
    });
    renderApp(<AccountingPanel kind="invoice" id={7} />);

    const articles = await screen.findAllByRole("article");
    expect(articles.map((article) => article.getAttribute("aria-label"))).toEqual([
      "Invoice INV-0007 issued, Oct 30, 2026",
      "Invoice INV-0007 voided, Oct 30, 2026",
    ]);
    expect(screen.getByRole("heading", { name: "Accounting" })).toBeTruthy();
    expect(within(articles[1]).getByText("Reversal")).toBeTruthy();
    expect(within(articles[0]).getByText("Reversed")).toBeTruthy();
    expect(screen.queryByText(/Dana Whitfield/)).toBeNull();
    expect(screen.getAllByRole("link", { name: "Receivable" })).toHaveLength(2);
  });

  it("says No entries. when the record made none", async () => {
    mockApi({ [INVOICE_7]: entriesReply([]) });
    renderApp(<AccountingPanel kind="invoice" id={7} />);
    expect(await screen.findByText("No entries.")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("asks for a bill's entries by the bill's kind and number", async () => {
    const calls = mockApi({ "GET /books/entries?kind=bill&source_id=12&limit=500": entriesReply([entry()]) });
    renderApp(<AccountingPanel kind="bill" id={12} />);
    await screen.findByRole("article");
    expect(calls.map((call) => call.path)).toEqual(["/books/entries?kind=bill&source_id=12&limit=500"]);
  });

  it("shows a failed read in the panel with Try again, and leaves the rest of the page", async () => {
    let failing = true;
    mockApi({
      [INVOICE_7]: () => (failing ? { status: 500, body: { detail: "Nope" } } : { body: entriesReply([entry()]) }),
    });
    renderApp(
      <>
        <p>The rest of the page</p>
        <AccountingPanel kind="invoice" id={7} />
      </>,
    );
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    expect(screen.getByText("The rest of the page")).toBeTruthy();

    failing = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("article")).toBeTruthy();
    expect(screen.queryByText("Couldn't load this.")).toBeNull();
  });

  it("reads again after a write, so a new entry appears without a reload", async () => {
    let entries = [entry({ id: 1 })];
    const calls = mockApi({ [INVOICE_7]: () => ({ body: entriesReply(entries) }) });
    const { client } = renderApp(<AccountingPanel kind="invoice" id={7} />);
    await screen.findByRole("article");

    entries = [entry({ id: 1 }), entry({ id: 2, description: "Payment received on INV-0007" })];
    await act(() => client.invalidateQueries());

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(calls).toHaveLength(2);
  });

  it("reads a payment's panel only once it's wanted, and has no heading of its own", async () => {
    const calls = mockApi({ "GET /books/entries?kind=payment&source_id=3&limit=500": entriesReply([entry()]) });
    const first = renderApp(<AccountingPanel kind="payment" id={3} heading={false} enabled={false} />);
    expect(calls).toEqual([]);
    first.unmount();

    renderApp(<AccountingPanel kind="payment" id={3} heading={false} />);
    await screen.findByRole("article");
    expect(calls).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Accounting" })).toBeNull();
    expect(screen.getByRole("region", { name: "Accounting" })).toBeTruthy();
  });
});
