import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryDefaults } from "../../lib/queryDefaults";
import { holdSaves, mockApi, user, type Call } from "../../test-utils";
import type { QuoteDetail, QuoteRow } from "../queries";
import { NewDraft, Quote } from "./Quote";

const ALEX = { id: "alex", name: "Alex Rivera" };
const ADDED = "2026-11-05T14:03:00Z";

const DRAFT: QuoteDetail = {
  id: 4,
  number: "QT-0004",
  status: "draft",
  deal: { id: 12, name: "Harbor & Pine renewal", stage: "proposal" },
  quote_date: "2026-11-05",
  valid_until: "2026-12-05",
  sent_on: null,
  decided_on: null,
  company: { name: "Plainsong Systems", address: null, email: null, phone: null },
  prepared_for: { organization: "Harbor & Pine", contact: "Sam Carter", email: null },
  tax_label: "Sales tax",
  tax_rate: "8.875",
  lines: [
    {
      id: 31,
      product_id: 1,
      name: "Standard license",
      description: null,
      quantity: 12,
      unit_price_cents: 48000,
      amount_cents: 576000,
    },
  ],
  subtotal_cents: 576000,
  tax_cents: 51120,
  total_cents: 627120,
  created_at: ADDED,
  created_by: ALEX,
  updated_at: ADDED,
  updated_by: ALEX,
};

const SENT: QuoteDetail = { ...DRAFT, status: "sent", sent_on: "2026-11-05" };

function row(quote: QuoteDetail, changes: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id: quote.id,
    number: quote.number,
    status: quote.status,
    deal_id: quote.deal.id,
    deal_name: quote.deal.name,
    deal_stage: quote.deal.stage,
    organization_id: 3,
    organization_name: "Harbor & Pine",
    quote_date: quote.quote_date,
    valid_until: quote.valid_until,
    subtotal_cents: quote.subtotal_cents,
    tax_cents: quote.tax_cents,
    total_cents: quote.total_cents,
    ...changes,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 5, 12, 0) });
});

afterEach(() => {
  vi.useRealTimers();
});

function Address() {
  return <output data-testid="address">{useLocation().pathname}</output>;
}

function show(address: string) {
  const client = new QueryClient({ defaultOptions: queryDefaults });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <Routes>
          <Route path="/quotes/new" element={<NewDraft />} />
          <Route path="/quotes/:id" element={<Quote />} />
        </Routes>
        <Address />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

/** A backend holding this quote, whose saves and status changes change what the next read gets. */
function backend(quote: QuoteDetail, routes: Record<string, unknown> = {}) {
  let held = quote;
  const calls = mockApi({
    [`GET /quotes/${quote.id}`]: () => ({ body: held }),
    [`GET /quotes?deal_id=${quote.deal.id}`]: [row(quote)],
    "GET /products": [],
    [`PATCH /quotes/${quote.id}`]: (body: unknown) => {
      const sent = body as { lines: { quantity: number }[] };
      held = { ...held, lines: held.lines.map((line, index) => ({ ...line, quantity: sent.lines[index].quantity })) };
      return { body: held };
    },
    [`POST /quotes/${quote.id}/send`]: () => {
      held = { ...held, status: "sent", sent_on: "2026-11-05" };
      return { body: held };
    },
    [`POST /quotes/${quote.id}/decline`]: () => {
      held = { ...held, status: "declined", decided_on: "2026-11-05" };
      return { body: held };
    },
    ...routes,
  });
  return {
    calls,
    replace: (next: QuoteDetail) => {
      held = next;
    },
  };
}

async function showQuote(quote: QuoteDetail, routes: Record<string, unknown> = {}) {
  const held = backend(quote, routes);
  const client = show(`/quotes/${quote.id}`);
  await screen.findByRole("heading", { level: 1, name: quote.number });
  return { ...held, client };
}

function header() {
  return within(screen.getByRole("heading", { level: 1 }).closest("div")!.parentElement!.parentElement!);
}

function buttonNames() {
  return header()
    .getAllByRole("button")
    .map((button) => button.textContent);
}

function quantityBox() {
  return document.getElementById("quote-line-0-quantity") as HTMLInputElement;
}

async function retype(box: HTMLInputElement, text: string) {
  await user().clear(box);
  await user().type(box, text);
}

function writes(calls: Call[]) {
  return calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.path}`);
}

describe("each status's buttons", () => {
  it("are Save quote, Mark as sent, Decline, Copy to new draft and Download PDF on a draft, with its form", async () => {
    await showQuote(DRAFT);
    expect(buttonNames()).toEqual(["Save quote", "Mark as sent", "Decline", "Copy to new draft", "Download PDF"]);
    expect(screen.getByLabelText("Valid until")).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "Preview" })).getByText("Draft")).toBeTruthy();
  });

  it("are Accept, Decline, Copy to new draft and Download PDF on a sent quote, which has no form (Q21)", async () => {
    await showQuote(SENT);
    expect(buttonNames()).toEqual(["Accept", "Decline", "Copy to new draft", "Download PDF"]);
    expect(screen.queryByLabelText("Valid until")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save quote" })).toBeNull();
    expect(header().getByText("Sent")).toBeTruthy();
  });

  it("show an expired quote as Expired, still with Accept (Q7)", async () => {
    await showQuote({ ...SENT, valid_until: "2026-11-04" });
    expect(header().getByText("Expired")).toBeTruthy();
    expect(buttonNames()).toContain("Accept");
  });

  it.each(["accepted", "declined"] as const)("are only Copy and Download PDF when %s", async (status) => {
    await showQuote({ ...SENT, status, decided_on: "2026-11-05" });
    expect(buttonNames()).toEqual(["Copy to new draft", "Download PDF"]);
    const details = within(screen.getByRole("region", { name: "Details" }));
    expect(details.getByText(status === "accepted" ? "Accepted" : "Declined")).toBeTruthy();
  });

  it("leave out Copy when the deal is closed (Q25)", async () => {
    await showQuote({ ...SENT, status: "accepted", deal: { ...SENT.deal, stage: "won" } });
    expect(buttonNames()).toEqual(["Download PDF"]);
  });

  it("link to the deal under the number", async () => {
    await showQuote(DRAFT);
    expect(screen.getByRole("link", { name: "Harbor & Pine renewal" }).getAttribute("href")).toBe("/deals/12");
  });
});

describe("saving a draft", () => {
  it("saves once however quickly it's pressed, and says so (Q19)", async () => {
    const { calls } = await showQuote(DRAFT);
    await retype(quantityBox(), "20");
    const release = holdSaves();
    const save = screen.getByRole("button", { name: "Save quote" });
    await user().click(save);
    await user().click(save);
    release();
    expect(await screen.findByText("Quote saved.")).toBeTruthy();
    expect(writes(calls)).toEqual(["PATCH /quotes/4"]);
  });

  it("keeps what's typed while a save is on its way, still to be saved (B10)", async () => {
    const { calls } = await showQuote(DRAFT);
    await retype(quantityBox(), "20");
    const release = holdSaves();
    await user().click(screen.getByRole("button", { name: "Save quote" }));
    await retype(quantityBox(), "25");
    release();
    expect(await screen.findByText("Quote saved.")).toBeTruthy();
    expect(quantityBox().value).toBe("25");

    await user().click(screen.getByRole("button", { name: "Save quote" }));
    await waitFor(() => expect(writes(calls)).toEqual(["PATCH /quotes/4", "PATCH /quotes/4"]));
    const saves = calls.filter((call) => call.method === "PATCH").map((call) => call.body);
    expect(saves).toEqual([
      { valid_until: "2026-12-05", lines: [{ id: 31, description: null, quantity: 20, unit_price_cents: 48000 }] },
      { valid_until: "2026-12-05", lines: [{ id: 31, description: null, quantity: 25, unit_price_cents: 48000 }] },
    ]);
  });

  it("keeps what was typed and shows the words when a teammate sent it meanwhile (Q21)", async () => {
    const words = "QT-0004 has been sent, so it can't be changed. Copy it to make a new draft.";
    await showQuote(DRAFT, { "PATCH /quotes/4": () => ({ status: 409, body: { detail: words } }) });
    await retype(quantityBox(), "20");
    await user().click(screen.getByRole("button", { name: "Save quote" }));
    expect(await screen.findByText(words)).toBeTruthy();
    expect(quantityBox().value).toBe("20");
  });

  it("takes a teammate's newer save while nothing is typed, and leaves a changed form alone (B10)", async () => {
    const { replace, client } = await showQuote(DRAFT);
    replace({ ...DRAFT, lines: [{ ...DRAFT.lines[0], quantity: 15 }] });
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(quantityBox().value).toBe("15"));

    await retype(quantityBox(), "30");
    replace({ ...DRAFT, lines: [{ ...DRAFT.lines[0], quantity: 40 }] });
    await act(() => client.invalidateQueries());
    expect(quantityBox().value).toBe("30");
  });
});

describe("Mark as sent", () => {
  it("asks first, saves a changed draft, then sends it (Q20)", async () => {
    const { calls } = await showQuote(DRAFT);
    await retype(quantityBox(), "20");
    await user().click(header().getByRole("button", { name: "Mark as sent" }));
    const dialog = within(screen.getByRole("alertdialog"));
    expect(dialog.getByText("Mark QT-0004 as sent?")).toBeTruthy();
    expect(
      dialog.getByText("It can't be changed after this. To change it later, copy it to a new draft."),
    ).toBeTruthy();
    expect(writes(calls)).toEqual([]);
    await user().click(dialog.getByRole("button", { name: "Mark as sent" }));
    expect(await screen.findByText("Quote sent.")).toBeTruthy();
    expect(writes(calls)).toEqual(["PATCH /quotes/4", "POST /quotes/4/send"]);
    expect(calls.find((call) => call.path === "/quotes/4/send")!.body).toEqual({});
    await waitFor(() => expect(buttonNames()).toContain("Accept"));
  });

  it("sends an unchanged draft without saving it", async () => {
    const { calls } = await showQuote(DRAFT);
    await user().click(header().getByRole("button", { name: "Mark as sent" }));
    await user().click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Mark as sent" }));
    await screen.findByText("Quote sent.");
    expect(writes(calls)).toEqual(["POST /quotes/4/send"]);
  });

  it("shows why it was refused, and a past date beside the date", async () => {
    await showQuote(DRAFT, {
      "POST /quotes/4/send": () => ({
        status: 422,
        body: { detail: "Check the form.", fields: { valid_until: "Choose a valid-until date from today on." } },
      }),
    });
    await user().click(header().getByRole("button", { name: "Mark as sent" }));
    await user().click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Mark as sent" }));
    expect(await screen.findByText("Choose a valid-until date from today on.")).toBeTruthy();
    expect(screen.getByLabelText("Valid until").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("Accept", () => {
  it("names the deal, its value in whole dollars and the quote it will decline, then says what changed (Q22)", async () => {
    const other = { ...SENT, id: 3, number: "QT-0003" };
    const { calls } = await showQuote(
      { ...SENT, subtotal_cents: 4_800_050 },
      {
        "GET /quotes?deal_id=12": [row(SENT), row(other), row({ ...DRAFT, id: 2, number: "QT-0002" })],
        "POST /quotes/4/accept": {
          quote: { ...SENT, status: "accepted", decided_on: "2026-11-05" },
          deal: { id: 12, name: "Harbor & Pine renewal", value: 48001 },
          changes: { close_date: "2026-11-05", new_customer: "Sam Carter", declined: ["QT-0003"] },
        },
      },
    );
    await user().click(header().getByRole("button", { name: "Accept" }));
    const dialog = within(screen.getByRole("alertdialog"));
    expect(dialog.getByText("Accept QT-0004?")).toBeTruthy();
    expect(
      await dialog.findByText(
        "Harbor & Pine renewal will move to Won with a value of $48,001, and QT-0003 will be marked declined. This can't be undone.",
      ),
    ).toBeTruthy();
    await user().click(dialog.getByRole("button", { name: "Accept quote" }));
    expect(
      await screen.findByText(
        "Quote accepted. Harbor & Pine renewal is now Won at $48,001. Close date set to today. Sam Carter is now a customer.",
      ),
    ).toBeTruthy();
    expect(writes(calls)).toEqual(["POST /quotes/4/accept"]);
  });
});

describe("Decline", () => {
  it("asks first, then declines (Q24)", async () => {
    const { calls } = await showQuote(DRAFT);
    await user().click(header().getByRole("button", { name: "Decline" }));
    const dialog = within(screen.getByRole("alertdialog"));
    expect(dialog.getByText("Decline QT-0004?")).toBeTruthy();
    expect(dialog.getByText("This can't be undone.")).toBeTruthy();
    await user().click(dialog.getByRole("button", { name: "Decline quote" }));
    expect(await screen.findByText("Quote declined.")).toBeTruthy();
    expect(writes(calls)).toEqual(["POST /quotes/4/decline"]);
  });

  it("can be cancelled", async () => {
    const { calls } = await showQuote(SENT);
    await user().click(header().getByRole("button", { name: "Decline" }));
    await user().click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(writes(calls)).toEqual([]);
  });
});

describe("Copy to new draft", () => {
  it("makes the copy at once and opens it (Q25)", async () => {
    const copy = { ...DRAFT, id: 5, number: "QT-0005" };
    await showQuote(SENT, { "POST /quotes/4/copy": copy, "GET /quotes/5": copy });
    await user().click(header().getByRole("button", { name: "Copy to new draft" }));
    expect(await screen.findByText("Copied to QT-0005.")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("/quotes/5"));
  });
});

describe("Download PDF", () => {
  // Nothing else undoes a stubbed global, and the router needs the real URL.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFileSaving() {
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:the-file", revokeObjectURL: () => undefined });
    const named: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      named.push(this.download);
    });
    return named;
  }

  it("saves a changed draft first, then downloads the PDF named after the number (Q30)", async () => {
    const { calls } = await showQuote(DRAFT, { "GET /quotes/4/pdf": "%PDF-" });
    const named = stubFileSaving();
    await retype(quantityBox(), "20");
    await user().click(header().getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(named).toEqual(["QT-0004.pdf"]));
    expect(
      calls.filter((call) => call.method !== "GET" || call.path.endsWith("/pdf")).map((call) => call.path),
    ).toEqual(["/quotes/4", "/quotes/4/pdf"]);
  });

  it("says why when the PDF can't be made", async () => {
    const words = "Add the company's name in Company settings first.";
    await showQuote(DRAFT, { "GET /quotes/4/pdf": () => ({ status: 409, body: { detail: words } }) });
    stubFileSaving();
    await user().click(header().getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByText(words)).toBeTruthy();
  });
});

describe("a new draft", () => {
  const START = {
    deal: DRAFT.deal,
    company: DRAFT.company,
    prepared_for: DRAFT.prepared_for,
    tax_label: "Sales tax",
    tax_rate: "8.875",
  };

  it("saves once, taking its number, and opens its page (Q9)", async () => {
    const calls = mockApi({
      "GET /quotes/new/12": START,
      "GET /products": [],
      "POST /quotes": () => ({ status: 201, body: { ...DRAFT, lines: [] } }),
      "GET /quotes/4": { ...DRAFT, lines: [] },
      "GET /quotes?deal_id=12": [],
    });
    show("/quotes/new?deal=12");
    expect(await screen.findByRole("heading", { level: 1, name: "New quote" })).toBeTruthy();
    expect(buttonNames()).toEqual(["Save quote"]);
    expect((screen.getByLabelText("Valid until") as HTMLInputElement).value).toBe("2026-12-05");
    const release = holdSaves();
    const save = screen.getByRole("button", { name: "Save quote" });
    await user().click(save);
    await user().click(save);
    release();
    expect(await screen.findByRole("heading", { level: 1, name: "QT-0004" })).toBeTruthy();
    expect(screen.getByTestId("address").textContent).toBe("/quotes/4");
    expect(writes(calls)).toEqual(["POST /quotes"]);
    expect(calls.find((call) => call.method === "POST")!.body).toEqual({
      deal_id: 12,
      valid_until: "2026-12-05",
      lines: [],
    });
  });

  it("says a closed deal can't take one, with a link to the deal (Q28)", async () => {
    mockApi({ "GET /quotes/new/12": { ...START, deal: { ...START.deal, stage: "won" } } });
    show("/quotes/new?deal=12");
    expect(
      await screen.findByRole("heading", { level: 1, name: "This deal is closed, so it can't take a new quote." }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Harbor & Pine renewal" }).getAttribute("href")).toBe("/deals/12");
  });

  it.each(["/quotes/new?deal=99", "/quotes/new?deal=abc", "/quotes/new"])(
    "says the deal no longer exists at %s",
    async (address) => {
      mockApi({});
      show(address);
      expect(await screen.findByRole("heading", { level: 1, name: "This deal no longer exists" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Back to Quotes" }).getAttribute("href")).toBe("/quotes");
    },
  );
});

describe("a missing quote", () => {
  it.each(["/quotes/99", "/quotes/abc", "/quotes/0"])("says it no longer exists at %s (Q28)", async (address) => {
    mockApi({});
    show(address);
    expect(await screen.findByRole("heading", { level: 1, name: "This quote no longer exists" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Quotes" }).getAttribute("href")).toBe("/quotes");
  });
});
