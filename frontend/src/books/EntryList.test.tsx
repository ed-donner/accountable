import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { EntryList } from "./EntryList";
import type { Entry } from "./queries";
import { entry } from "./test-books";

function show(entries: Entry[], showWho = false) {
  return render(
    <MemoryRouter>
      <EntryList entries={entries} showWho={showWho} />
    </MemoryRouter>,
  );
}

function cells(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
}

describe("an entry", () => {
  it("puts each line's amount in its own column and leaves the other empty", () => {
    show([entry()]);
    const rows = screen.getAllByRole("row");
    // Heading, three lines, the total.
    expect(rows).toHaveLength(5);
    expect(cells(rows[1])).toEqual(["Receivable", "$1,088.75", ""]);
    expect(cells(rows[2])).toEqual(["Revenue", "", "$1,000.00"]);
    expect(cells(rows[3])).toEqual(["Tax payable", "", "$88.75"]);
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("totals the two columns, and they are equal", () => {
    show([entry()]);
    const total = screen.getAllByRole("row")[4];
    expect(within(total).getByRole("rowheader").textContent).toBe("Total");
    expect(within(total).getByRole("rowheader").className).toContain("font-semibold");
    expect(cells(total)).toEqual(["$1,088.75", "$1,088.75"]);
  });

  it("adds sums past what a number holds exactly", () => {
    const big = 2 ** 53 - 1;
    const lines = [
      { account: "cash", debit_cents: big, credit_cents: 0 },
      { account: "payable", debit_cents: 0, credit_cents: big },
    ];
    show([entry({ lines: [...lines, ...lines] })]);
    expect(cells(screen.getAllByRole("row")[5])).toEqual(["$180,143,985,094,819.82", "$180,143,985,094,819.82"]);
  });

  it("names its columns for a screen reader", () => {
    show([entry()]);
    const headings = screen.getAllByRole("columnheader").map((heading) => heading.textContent);
    expect(headings).toEqual(["Account", "Debit", "Credit"]);
    expect(screen.getAllByRole("columnheader")[1].className).toContain("text-right");
  });

  it("shows the date, the description, the document as a link and the accounts as links", () => {
    show([entry()]);
    expect(screen.getByText("Oct 30, 2026")).toBeTruthy();
    expect(screen.getByText("Invoice INV-0007 issued").className).toContain("font-semibold");
    expect(screen.getByRole("link", { name: "INV-0007" }).getAttribute("href")).toBe("/invoices/7");
    expect(screen.getByRole("link", { name: "Receivable" }).getAttribute("href")).toBe(
      "/accounting/accounts/receivable",
    );
    expect(screen.getByRole("link", { name: "Tax payable" }).getAttribute("href")).toBe(
      "/accounting/accounts/tax_payable",
    );
  });

  it("marks a reversal and a reversed entry, and nothing else", () => {
    show([
      entry({ id: 3, reverses_id: 2, description: "Invoice INV-0007 voided" }),
      entry({ id: 2, reversed_by_id: 3 }),
      entry({ id: 1, description: "Plain" }),
    ]);
    expect(screen.getAllByText("Reversal")).toHaveLength(1);
    expect(screen.getAllByText("Reversed")).toHaveLength(1);
    const reversal = screen.getByRole("article", { name: /voided/ });
    expect(within(reversal).getByText("Reversal")).toBeTruthy();
    // Quiet chips, never Raspberry: a reversal is a normal event.
    expect(screen.getByText("Reversal").className).toContain("text-muted");
    expect(screen.getByText("Reversal").className).not.toContain("raspberry");
  });

  it("shows who made it and when in the Journal, and not in a panel", () => {
    const { unmount } = show([entry()], true);
    expect(screen.getByText("Dana Whitfield, Oct 30, 2026")).toBeTruthy();
    unmount();
    show([entry()]);
    expect(screen.queryByText(/Dana Whitfield/)).toBeNull();
  });

  it("shows no one for an entry posted for a record that already existed", () => {
    show([entry({ created_by: null })], true);
    expect(screen.queryByText(/Whitfield/)).toBeNull();
  });

  it("links the opening balance, which has no number, to Company settings", () => {
    show([
      entry({
        kind: "opening_balance",
        document: null,
        link: "/settings",
        description: "Opening balance set",
        lines: [
          { account: "cash", debit_cents: 400000, credit_cents: 0 },
          { account: "owners_equity", debit_cents: 0, credit_cents: 400000 },
        ],
      }),
    ]);
    expect(screen.getByRole("link", { name: "Company settings" }).getAttribute("href")).toBe("/settings");
  });

  it("draws a reversal's lines with the sides it was posted with", () => {
    show([
      entry({
        reverses_id: 1,
        lines: [
          { account: "receivable", debit_cents: 0, credit_cents: 108875 },
          { account: "revenue", debit_cents: 100000, credit_cents: 0 },
          { account: "tax_payable", debit_cents: 8875, credit_cents: 0 },
        ],
      }),
    ]);
    expect(cells(screen.getAllByRole("row")[1])).toEqual(["Receivable", "", "$1,088.75"]);
  });

  it("leaves a reversed entry as it is, not dimmed or struck through", () => {
    show([entry({ reversed_by_id: 9 })]);
    const block = screen.getByRole("article");
    expect(block.className).not.toMatch(/opacity|line-through/);
    expect(block.innerHTML).not.toMatch(/line-through|opacity/);
  });

  it("sets each line 36px tall with no grid lines, and a rule above the totals", () => {
    show([entry()]);
    const rows = screen.getAllByRole("row");
    expect(rows[1].className).toContain("h-9");
    expect(rows[4].className).toContain("border-t");
    expect(rows[1].className).not.toContain("border");
  });
});
