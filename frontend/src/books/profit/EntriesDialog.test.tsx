import { screen, waitFor, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, renderApp, user } from "../../test-utils";
import { EntriesDialog, eventName } from "./EntriesDialog";
import { TODAY, entriesReply, entry } from "./test-profit";
import type { Target } from "./queries";

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: TODAY }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const TARGET: Target = {
  figure: "revenue",
  name: "Revenue",
  periodLabel: "March 2026",
  from: "2026-03-01",
  to: "2026-03-31",
};
const FIRST = "GET /books/profit-and-loss/entries?figure=revenue&from=2026-03-01&to=2026-03-31&limit=100&offset=0";
const SECOND = FIRST.replace("offset=0", "offset=2");
const FAILED = { status: 500, body: { detail: "Something went wrong." } };

const BILL = entry(5, {
  kind: "bill",
  event: "bill_changed",
  link: "/bills/5",
  label: "8841 from Northwind Software",
  amount: "-20000",
  reverses_id: 4,
  entry_date: "2026-03-05",
});
const GONE = entry(6, { kind: "bill", event: "bill_deleted", link: "/bills/6", label: null, amount: "3000" });

function Harness({ onClose = () => undefined }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  const figure = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={figure}>Revenue figure</button>
      {open && (
        <EntriesDialog
          target={TARGET}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          onCloseFocus={() => figure.current?.focus()}
        />
      )}
    </>
  );
}

function show(routes: Record<string, unknown>) {
  const calls = mockApi(routes);
  renderApp(<Harness />);
  return calls;
}

describe("the entries dialog", () => {
  it("is titled with the figure and the period, with the total and how many entries", async () => {
    show({ [FIRST]: entriesReply("revenue", [entry(1), entry(2, { amount: "50050" })]) });
    expect(await screen.findByRole("dialog", { name: "Revenue, March 2026" })).toBeTruthy();
    expect(await screen.findByText("$1,500.50")).toBeTruthy();
    expect(screen.getByText("2 entries")).toBeTruthy();
  });

  it("lists each entry with its date, link, what happened and amount", async () => {
    show({ [FIRST]: entriesReply("revenue", [entry(1), BILL, GONE]) });
    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Nov 2, 2026Invoice INV-001 Issued$1,000.00",
      "Mar 5, 2026Bill 8841 from Northwind Software Changed Reversal-$200.00",
      "Nov 2, 2026Deleted bill Deleted$30.00",
    ]);
    expect(within(rows[0]).getByRole("link").getAttribute("href")).toBe("/invoices/1");
    expect(within(rows[1]).getByRole("link").getAttribute("href")).toBe("/bills/5");
  });

  it("marks a reversal with a chip, and a deleted record with muted words and no link", async () => {
    show({ [FIRST]: entriesReply("revenue", [BILL, GONE]) });
    const [reversal, deleted] = await screen.findAllByRole("listitem");
    expect(within(reversal).getByText("Reversal")).toBeTruthy();
    expect(within(deleted).queryByText("Reversal")).toBeNull();
    expect(within(deleted).queryByRole("link")).toBeNull();
    expect(within(deleted).getByText("Deleted bill").className).toContain("text-muted");
  });

  it("says when there are no entries", async () => {
    show({ [FIRST]: entriesReply("revenue", []) });
    expect(await screen.findByText("No entries.")).toBeTruthy();
    expect(screen.getByText("0 entries")).toBeTruthy();
  });

  it("shows more by reading the next page, until all are shown", async () => {
    const calls = show({
      [FIRST]: entriesReply("revenue", [entry(1), entry(2)], { count: 3, total: "300000" }),
      [SECOND]: entriesReply("revenue", [entry(3)], { count: 3, total: "300000" }),
    });
    await screen.findAllByRole("listitem");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await user().click(screen.getByRole("button", { name: "Show more" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(calls.map((call) => call.path.match(/offset=(\d+)/)?.[1])).toEqual(["0", "2"]);
  });

  it("says a read that failed, and reads again with Try again", async () => {
    let tries = 0;
    show({
      [FIRST]: () => (++tries === 1 ? FAILED : { body: entriesReply("revenue", [entry(1)]) }),
    });
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();

    await user().click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Invoice INV-001", { exact: false })).toBeTruthy();
    expect(screen.queryByText("Couldn't load this.")).toBeNull();
  });

  it("keeps the rows when a later page fails, and says so", async () => {
    show({
      [FIRST]: entriesReply("revenue", [entry(1), entry(2)], { count: 3 }),
      [SECOND]: () => FAILED,
    });
    await screen.findAllByRole("listitem");

    await user().click(screen.getByRole("button", { name: "Show more" }));

    expect(await screen.findByText("Couldn't refresh this, so it may be out of date.")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("closes with Close and with Escape, and puts focus back on the figure", async () => {
    show({ [FIRST]: entriesReply("revenue", [entry(1)]) });
    await screen.findAllByRole("listitem");
    const keys = user();

    await keys.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Revenue figure" }));
  });

  it("closes with Escape", async () => {
    show({ [FIRST]: entriesReply("revenue", [entry(1)]) });
    await screen.findAllByRole("listitem");
    await user().keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Revenue figure" }));
  });

  it("shows sums past 2^53 cents to the cent", async () => {
    show({ [FIRST]: entriesReply("revenue", [entry(1, { amount: "9007199254740993" })]) });
    expect((await screen.findAllByText("$90,071,992,547,409.93")).length).toBe(2);
  });
});

describe("what happened", () => {
  it.each([
    ["invoice_issued", "Issued"],
    ["invoice_voided", "Voided"],
    ["bill_added", "Added"],
    ["bill_changed", "Changed"],
    ["bill_deleted", "Deleted"],
  ])("%s is %s", (event, name) => {
    expect(eventName(event)).toBe(name);
  });
});
