import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Deal } from "../../crm/queries";
import { queryDefaults } from "../../lib/queryDefaults";
import { mockApi, user } from "../../test-utils";
import type { QuoteRow } from "../queries";
import { Quotes } from "./Quotes";

function quote(id: number, changes: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id,
    number: `QT-${String(id).padStart(4, "0")}`,
    status: "draft",
    deal_id: 12,
    deal_name: "Renewal and upgrade",
    deal_stage: "proposal",
    organization_id: 3,
    organization_name: "Harbor & Pine",
    quote_date: "2026-11-01",
    valid_until: "2026-12-01",
    subtotal_cents: 100_00,
    tax_cents: 8_88,
    total_cents: 108_88,
    ...changes,
  };
}

const ROWS: QuoteRow[] = [
  quote(1, { status: "accepted", subtotal_cents: 4_800_000, total_cents: 5_226_000, organization_name: null }),
  quote(2, { status: "sent", valid_until: "2026-11-04", subtotal_cents: 2_000_00, deal_name: "Kiosks" }),
  quote(3, { status: "sent", valid_until: "2026-11-05", subtotal_cents: 1_000_00 }),
  quote(4, { status: "declined", subtotal_cents: 50_00 }),
  quote(5, { subtotal_cents: 25_50 }),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 5, 12, 0) });
});

afterEach(() => {
  vi.useRealTimers();
});

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname + location.search}</output>;
}

function show(rows: QuoteRow[], address = "/quotes", deals: Partial<Deal>[] | (() => unknown) = []) {
  mockApi({ "GET /quotes": rows, "GET /deals": deals });
  const client = new QueryClient({ defaultOptions: queryDefaults });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <Routes>
          <Route path="/quotes" element={<Quotes />} />
          <Route path="*" element={null} />
        </Routes>
        <Address />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function numbers() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

function figures() {
  return within(screen.getByRole("group", { name: "Filter by status" }));
}

function address() {
  return screen.getByTestId("address").textContent;
}

describe("the Quotes table", () => {
  it("has Q33's columns, newest first, and no buttons on its rows", async () => {
    show(ROWS);
    await screen.findByText("QT-0005");
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Number",
      "Deal",
      "Organization",
      "Status",
      "Value",
      "Total",
      "Date",
      "Valid until",
    ]);
    expect(numbers()).toEqual(["QT-0005", "QT-0004", "QT-0003", "QT-0002", "QT-0001"]);
    const first = within(screen.getAllByRole("row")[5]);
    expect(first.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "QT-0001",
      "Renewal and upgrade",
      "None",
      "Accepted",
      "$48,000.00",
      "$52,260.00",
      "Nov 1, 2026",
      "Dec 1, 2026",
    ]);
    expect(screen.queryByRole("button", { name: /^(Edit|Delete) QT/ })).toBeNull();
    expect(screen.getByRole("link", { name: "QT-0005" }).getAttribute("href")).toBe("/quotes/5");
  });

  it("sorts Number in the order the numbers were taken, past QT-9999 and whatever the prefix", async () => {
    show([
      quote(9999, { number: "QT-9999" }),
      quote(10000, { number: "QT-10000" }),
      quote(10001, { number: "Q-10001" }),
    ]);
    await screen.findByText("QT-9999");
    await user().click(screen.getByRole("button", { name: "Number" }));
    expect(numbers()).toEqual(["QT-9999", "QT-10000", "Q-10001"]);
  });

  it("sorts Status as Draft, Sent, Expired, Accepted, Declined", async () => {
    show(ROWS);
    await screen.findByText("QT-0005");
    await user().click(screen.getByRole("button", { name: "Status" }));
    expect(numbers()).toEqual(["QT-0005", "QT-0003", "QT-0002", "QT-0001", "QT-0004"]);
  });
});

describe("the figures", () => {
  it("count and add up every quote and each status, expired apart from sent (Q34)", async () => {
    show(ROWS);
    await screen.findByText("QT-0005");
    expect(
      figures()
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "All5$51,075.50",
      "Draft1$25.50",
      "Sent1$1,000.00",
      "Expired1$2,000.00",
      "Accepted1$48,000.00",
      "Declined1$50.00",
    ]);
  });

  it("filter the table, kept in the address, and work with the search", async () => {
    show(ROWS);
    await screen.findByText("QT-0005");
    await user().click(figures().getByRole("button", { name: /^Expired/ }));
    expect(numbers()).toEqual(["QT-0002"]);
    expect(address()).toBe("/quotes?status=expired");
    expect(
      figures()
        .getByRole("button", { name: /^Expired/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(figures().getByRole("button", { name: /^All/ }).textContent).toBe("All5$51,075.50");

    await user().click(figures().getByRole("button", { name: /^Sent/ }));
    await user().type(screen.getByRole("searchbox"), "renewal");
    expect(numbers()).toEqual(["QT-0003"]);
  });

  it("are read from the address", async () => {
    show(ROWS, "/quotes?status=declined");
    expect(await screen.findByText("QT-0004")).toBeTruthy();
    expect(numbers()).toEqual(["QT-0004"]);
  });

  it("clear with the search when nothing matches (T7)", async () => {
    show(ROWS, "/quotes?status=draft&q=zzz");
    await user().click(await screen.findByRole("button", { name: "Clear search" }));
    expect(address()).toBe("/quotes");
  });
});

describe("with nothing to show", () => {
  it("invites the first quote from an open deal (Q35)", async () => {
    show([]);
    expect(await screen.findByText("No quotes yet. Add the first one from an open deal.")).toBeTruthy();
    expect(
      within(screen.getByText(/^No quotes yet/).parentElement!).getByRole("button", { name: "New quote" }),
    ).toBeTruthy();
  });

  it("says a filter has no quotes, with a button that shows them all", async () => {
    show([quote(1, { status: "accepted" })], "/quotes?status=expired");
    expect(await screen.findByText("No expired quotes.")).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Show all quotes" }));
    expect(address()).toBe("/quotes");
  });
});

describe("New quote", () => {
  const DEALS = [
    { id: 12, name: "Renewal and upgrade", stage: "proposal", organization_name: "Harbor & Pine" },
    { id: 13, name: "Kiosks", stage: "new", organization_name: null },
    { id: 14, name: "Already won", stage: "won", organization_name: null },
    { id: 15, name: "Already lost", stage: "lost", organization_name: null },
  ] as Partial<Deal>[];

  it("asks which deal, listing open deals only with no offer to add one, then opens the new draft (Q8)", async () => {
    show(ROWS, "/quotes", DEALS);
    await user().click(await screen.findByRole("button", { name: "New quote" }));
    const dialog = within(screen.getByRole("dialog", { name: "New quote" }));
    await user().click(dialog.getByRole("combobox", { name: "Deal" }));
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "Renewal and upgradeHarbor & Pine",
      "Kiosks",
    ]);
    await user().type(screen.getByPlaceholderText("Search open deals"), "nothing like it");
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.queryByText(/^Add/)).toBeNull();
    await user().clear(screen.getByPlaceholderText("Search open deals"));
    await user().click(screen.getByRole("option", { name: /^Kiosks/ }));
    await user().click(dialog.getByRole("button", { name: "Continue" }));
    expect(address()).toBe("/quotes/new?deal=13");
  });

  it("needs a deal chosen", async () => {
    show(ROWS, "/quotes", DEALS);
    await user().click(await screen.findByRole("button", { name: "New quote" }));
    const dialog = within(screen.getByRole("dialog", { name: "New quote" }));
    await user().click(dialog.getByRole("button", { name: "Continue" }));
    expect(dialog.getByText("Choose an open deal")).toBeTruthy();
    expect(address()).toBe("/quotes");
  });

  it("closes and says so when the deals can't be read, rather than offering none (F11)", async () => {
    const failure = vi.spyOn(toast, "error");
    show(ROWS, "/quotes", () => ({ status: 500, body: { detail: "Something went wrong." } }));
    await user().click(await screen.findByRole("button", { name: "New quote" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New quote" })).toBeNull());
    expect(failure).toHaveBeenCalledWith("Couldn't open the form. Try again.", expect.anything());
  });
});
