import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user } from "../test-utils";
import { EntriesDialog, type Opened } from "./EntriesDialog";
import { entriesReply, entry } from "./test-balance";

const DAY = "2026-10-31";
const CASH: Opened = { id: "cash", name: "Cash", cents: 6230000n, day: DAY };
const PROFIT: Opened = { id: "profit", name: "Profit to date", cents: 7000n, day: DAY };
const PATH = `/books/entries?account=cash&to=${DAY}&limit=100&offset=0`;

function open(routes: Record<string, unknown>, opened = CASH) {
  const calls = mockApi(routes);
  const onClose = vi.fn();
  const onCloseFocus = vi.fn();
  const { client } = renderApp(<EntriesDialog opened={opened} onClose={onClose} onCloseFocus={onCloseFocus} />);
  return { calls, onClose, onCloseFocus, client };
}

const cashEntry = (id: number, cents: number, changes = {}) =>
  entry(id, {
    lines: [
      { account: "cash", debit_cents: cents > 0 ? cents : 0, credit_cents: cents < 0 ? -cents : 0 },
      { account: "receivable", debit_cents: cents < 0 ? -cents : 0, credit_cents: cents > 0 ? cents : 0 },
    ],
    ...changes,
  });

describe("EntriesDialog", () => {
  it("is titled by the account and the day, with the figure at its top", async () => {
    open({ [`GET ${PATH}`]: entriesReply([cashEntry(1, 5000)]) });
    expect(await screen.findByRole("dialog", { name: "Cash up to Oct 31, 2026" })).toBeTruthy();
    expect(screen.getByText("$62,300.00")).toBeTruthy();
    expect(screen.getByText("Balance on Oct 31, 2026")).toBeTruthy();
  });

  it("lists each entry with its date, words, link, who made it and its effect", async () => {
    open({
      [`GET ${PATH}`]: entriesReply([
        cashEntry(1, 12550, {
          event: "payment_recorded",
          kind: "invoice",
          link: "/invoices/4",
          entry_date: "2026-10-28",
        }),
        cashEntry(2, -3000, { event: "bill_paid", link: "/bills/9", created_by: null, entry_date: "2026-10-02" }),
      ]),
    });
    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Oct 28, 2026Payment recordedAlex Rivera$125.50",
      "Oct 2, 2026Bill paid-$30.00",
    ]);
    expect(within(rows[0]).getByRole("link").getAttribute("href")).toBe("/invoices/4");
    expect(within(rows[1]).getByRole("link").getAttribute("href")).toBe("/bills/9");
  });

  it("has effects that add up to the figure", async () => {
    open(
      { [`GET ${PATH}`]: entriesReply([cashEntry(1, 10000), cashEntry(2, -2500), cashEntry(3, 500)]) },
      { ...CASH, cents: 8000n },
    );
    const rows = await screen.findAllByRole("listitem");
    const sum = rows.reduce((total, row) => {
      const text = row.lastElementChild!.textContent!.replace(/[$,]/g, "");
      return total + Math.round(Number(text) * 100);
    }, 0);
    expect(sum).toBe(8000);
  });

  it("says a reversal by its words", async () => {
    open({ [`GET ${PATH}`]: entriesReply([cashEntry(1, -10000, { event: "invoice_voided", reverses_id: 5 })]) });
    expect(await screen.findByRole("link", { name: "Invoice voided" })).toBeTruthy();
  });

  it("reads the entries of Revenue and every expense account for Profit to date", async () => {
    const accounts = [
      "revenue",
      "expense_software",
      "expense_contractors",
      "expense_travel",
      "expense_office",
      "expense_marketing",
      "expense_other",
    ];
    const path = `/books/entries?${accounts.map((key) => `account=${key}`).join("&")}&to=${DAY}&limit=100&offset=0`;
    const { calls } = open({ [`GET ${path}`]: entriesReply([entry(1)]) }, PROFIT);
    expect(await screen.findByRole("dialog", { name: "Profit to date up to Oct 31, 2026" })).toBeTruthy();
    const row = await screen.findByRole("listitem");
    expect(row.lastElementChild?.textContent).toBe("$100.00");
    expect(calls.map((call) => call.path)).toEqual([path]);
  });

  it("shows how many it's showing and reads the next 100 on Show more, dropping a repeat", async () => {
    const first = Array.from({ length: 100 }, (_, index) => cashEntry(index + 1, 100));
    const second = [cashEntry(100, 100), ...Array.from({ length: 5 }, (_, index) => cashEntry(101 + index, 100))];
    const { calls } = open({
      [`GET ${PATH}`]: entriesReply(first, 106),
      [`GET /books/entries?account=cash&to=${DAY}&limit=100&offset=100`]: entriesReply(second, 106),
    });
    expect(await screen.findByText("Showing 100 of 106")).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Showing 105 of 106")).toBeTruthy();
    expect(calls).toHaveLength(2);
    expect(screen.getAllByRole("listitem")).toHaveLength(105);
  });

  it("has no Show more once everything is shown", async () => {
    open({ [`GET ${PATH}`]: entriesReply([cashEntry(1, 100)]) });
    expect(await screen.findByText("Showing 1 of 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("says when there are no entries", async () => {
    open({ [`GET ${PATH}`]: entriesReply([]) });
    expect(await screen.findByText("No entries up to Oct 31, 2026.")).toBeTruthy();
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it("fails with Try again, and reads again", async () => {
    let attempts = 0;
    open({
      [`GET ${PATH}`]: () =>
        ++attempts === 1 ? { status: 500, body: { detail: "No." } } : { body: entriesReply([cashEntry(1, 100)]) },
    });
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Showing 1 of 1")).toBeTruthy();
  });

  it("keeps a list read before when it is read again and that fails", async () => {
    let attempts = 0;
    const { client } = open({
      [`GET ${PATH}`]: () =>
        ++attempts === 1 ? { body: entriesReply([cashEntry(1, 100)]) } : { status: 500, body: { detail: "No." } },
    });
    await screen.findByText("Showing 1 of 1");
    void client.invalidateQueries({ queryKey: ["books"] });
    expect(await screen.findByText("Couldn't refresh this, so it may be out of date.")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("closes with Close and with Escape", async () => {
    const { onClose } = open({ [`GET ${PATH}`]: entriesReply([]) });
    await screen.findByText("No entries up to Oct 31, 2026.");
    await user().keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await user().click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
