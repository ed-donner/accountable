import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, user } from "../../test-utils";
import { FakeObserver, ledgerLine, ledgerReply, monthsReply, renderAt, stubObserver } from "../test-books";
import { LedgerPage } from "./Ledger";

const MONTHS = "GET /books/months";

function open(key: string) {
  return renderAt(`/accounting/accounts/${key}`, "/accounting/accounts/:key", <LedgerPage />);
}

function ledgerPath(key: string, offset = 0) {
  return `GET /books/accounts/${key}/ledger?limit=100&offset=${offset}`;
}

beforeEach(stubObserver);
afterEach(() => vi.unstubAllGlobals());

const TWELVE = [
  "0",
  "0",
  "100000",
  "100000",
  "250000",
  "250000",
  "250000",
  "400000",
  "400000",
  "400000",
  "1000000",
  "1005000",
];

describe("an account's ledger", () => {
  it("shows the name and type, a link back, the balance and what it's after", async () => {
    mockApi({
      [ledgerPath("cash")]: ledgerReply({
        lines: [ledgerLine({ balance_cents: "1005000" }), ledgerLine({ id: 2, balance_cents: "955000" })],
        total: 87,
        last_entry_date: "2026-10-30",
      }),
      [MONTHS]: monthsReply("cash", TWELVE),
    });
    open("cash");

    expect(await screen.findByTestId("balance")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("balance").textContent).toBe("$10,050.00"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Cash");
    expect(screen.getByText("Asset")).toBeTruthy();
    expect(screen.getByText("after 87 lines, last on Oct 30, 2026")).toBeTruthy();
    expect(screen.getByRole("link", { name: "All entries" }).getAttribute("href")).toBe("/accounting/journal");
    expect(document.title).toBe("Cash | Accountable");
  });

  it("shows the header balance equal to the newest line's running balance", async () => {
    mockApi({
      [ledgerPath("payable")]: ledgerReply({
        key: "payable",
        name: "Payable",
        type: "liability",
        lines: [ledgerLine({ balance_cents: "500" }), ledgerLine({ id: 2, balance_cents: "0" })],
      }),
      [MONTHS]: monthsReply("payable", TWELVE),
    });
    open("payable");
    await screen.findByText("Payable");
    const rows = within(await screen.findByRole("region", { name: "Lines" })).getAllByRole("row");
    const newest = within(rows[1]).getAllByRole("cell").at(-1)?.textContent;
    expect(newest).toBe("$5.00");
    expect(screen.getByTestId("balance").textContent).toBe(newest);
  });

  it("has the Debit, Credit and Balance columns, newest first, each side blank on the other", async () => {
    mockApi({
      [ledgerPath("cash")]: ledgerReply({
        lines: [
          ledgerLine({
            id: 2,
            description: "Bill 4417 paid",
            document: "4417",
            link: "/bills/12",
            debit_cents: 0,
            credit_cents: 55000,
            balance_cents: "950000",
          }),
          ledgerLine({ id: 1, balance_cents: "1005000" }),
        ],
      }),
      [MONTHS]: monthsReply("cash", TWELVE),
    });
    open("cash");
    await screen.findByText("Bill 4417 paid");
    const lines = within(screen.getByRole("region", { name: "Lines" }));
    expect(lines.getAllByRole("columnheader").map((heading) => heading.textContent)).toEqual([
      "Date",
      "Description",
      "Document",
      "Debit",
      "Credit",
      "Balance",
    ]);
    const rows = lines.getAllByRole("row");
    expect(
      within(rows[1])
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Oct 30, 2026", "Bill 4417 paid", "4417", "", "$550.00", "$9,500.00"]);
    expect(within(rows[1]).getByRole("link", { name: "4417" }).getAttribute("href")).toBe("/bills/12");
    expect(within(rows[2]).getAllByRole("cell")[3].textContent).toBe("$500.00");
    expect(within(rows[2]).getAllByRole("cell")[4].textContent).toBe("");
    expect(within(rows[1]).getAllByRole("cell").at(-1)?.className).toContain("font-semibold");
    expect(lines.getAllByRole("columnheader")[0].className).toContain("sticky");
  });

  it("marks a line from a reversal, and one that was reversed", async () => {
    mockApi({
      [ledgerPath("revenue")]: ledgerReply({
        key: "revenue",
        name: "Revenue",
        type: "revenue",
        lines: [
          ledgerLine({ id: 2, is_reversal: true, description: "Invoice INV-0007 voided" }),
          ledgerLine({ id: 1, is_reversed: true }),
        ],
      }),
      [MONTHS]: monthsReply("revenue", TWELVE),
    });
    open("revenue");
    await screen.findByText("Reversal");
    const lines = within(screen.getByRole("region", { name: "Lines" }));
    expect(within(lines.getAllByRole("row")[1]).getByText("Reversal")).toBeTruthy();
    expect(within(lines.getAllByRole("row")[2]).getByText("Reversed")).toBeTruthy();
  });

  it("shows a negative balance with a minus sign", async () => {
    mockApi({
      [ledgerPath("cash")]: ledgerReply({ lines: [ledgerLine({ balance_cents: "-425000" })] }),
      [MONTHS]: monthsReply("cash", ["-100", "-425000"]),
    });
    open("cash");
    await waitFor(() => expect(screen.getByTestId("balance").textContent).toBe("-$4,250.00"));
  });

  it("charts the twelve months and has a table behind the chart", async () => {
    mockApi({
      [ledgerPath("cash")]: ledgerReply(),
      [MONTHS]: monthsReply("cash", TWELVE),
    });
    open("cash");
    const chart = await screen.findByRole("img");
    expect(chart.getAttribute("aria-label")).toContain("Cash balance at the end of each of the last 12 months");
    const table = screen.getByRole("table", { name: "Cash balance at the end of each month" });
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(within(table).getByText("$10,050.00")).toBeTruthy();
  });

  it("says No entries in this account yet. for an account with no lines, and charts $0.00", async () => {
    mockApi({
      [ledgerPath("expense_travel")]: ledgerReply({
        key: "expense_travel",
        name: "Travel",
        type: "expense",
        lines: [],
        balance_cents: "0",
        total: 0,
        last_entry_date: null,
      }),
      [MONTHS]: monthsReply("expense_travel", Array(12).fill("0")),
    });
    open("expense_travel");
    expect(await screen.findByText("No entries in this account yet.")).toBeTruthy();
    expect(screen.getByText("No entries yet")).toBeTruthy();
    expect(screen.getByTestId("balance").textContent).toBe("$0.00");
    expect((await screen.findByRole("img")).getAttribute("aria-label")).toContain("ending at $0.00");
  });

  it("loads the next page, with the balances the backend worked out, once", async () => {
    const first = Array.from({ length: 100 }, (_unused, place) =>
      ledgerLine({ id: 300 - place, balance_cents: String(300 - place) }),
    );
    const second = Array.from({ length: 20 }, (_unused, place) =>
      ledgerLine({ id: 200 - place, balance_cents: String(200 - place) }),
    );
    const calls = mockApi({
      [ledgerPath("cash")]: ledgerReply({ lines: first, total: 120, balance_cents: "300" }),
      [ledgerPath("cash", 100)]: ledgerReply({ lines: second, total: 120, balance_cents: "300" }),
      [MONTHS]: monthsReply("cash", TWELVE),
    });
    open("cash");
    const lines = within(await screen.findByRole("region", { name: "Lines" }));
    expect(await screen.findByText("Showing 100 of 120 lines")).toBeTruthy();
    act(() => FakeObserver.see());
    await waitFor(() => expect(lines.getAllByRole("row")).toHaveLength(121));
    expect(screen.getByText("Showing 120 of 120 lines")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(calls.filter((call) => call.path.includes("offset=100"))).toHaveLength(1);
    // The header stays the account's balance, not the page's.
    expect(screen.getByTestId("balance").textContent).toBe("$3.00");
  });

  it("loads more from the button too", async () => {
    mockApi({
      [ledgerPath("cash")]: ledgerReply({ lines: [ledgerLine()], total: 2 }),
      [ledgerPath("cash", 1)]: ledgerReply({ lines: [ledgerLine({ id: 2 })], total: 2 }),
      [MONTHS]: monthsReply("cash", TWELVE),
    });
    open("cash");
    await user().click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByText("Showing 2 of 2 lines")).toBeTruthy());
  });

  it("says an account that isn't one no longer exists, without asking the backend, with a link back", async () => {
    const calls = mockApi({});
    open("bank");
    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This account no longer exists");
    expect(screen.getByRole("link", { name: "Back to Journal" }).getAttribute("href")).toBe("/accounting/journal");
    expect(calls).toEqual([]);
  });

  it("shows a failed read with Try again", async () => {
    let failing = true;
    mockApi({
      [ledgerPath("cash")]: () => (failing ? { status: 500, body: { detail: "x" } } : { body: ledgerReply() }),
      [MONTHS]: monthsReply("cash", TWELVE),
    });
    open("cash");
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    failing = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("balance").textContent).toBe("$10,050.00"));
  });
});
