import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { stops } from "./books/balance";
import { balancesReply } from "./books/test-balance";
import { cashFlowReply, quietMonths } from "./cashflow/test-cash-flow";
import { todayIso } from "./lib/dates";
import { THEME_KEY } from "./lib/theme";
import { META, mockApi, startSignedIn, user, type Call } from "./test-utils";

const SEARCH_BOX = "Search organizations, contacts, deals and products";
const ALEX = { id: "alex", name: "Alex Rivera", email: "alex@accountable.example", initials: "AR" };
const SETTINGS = {
  company_name: "Plainsong Systems",
  address: null,
  email: null,
  phone: null,
  tax_label: "Sales tax",
  tax_rate: "8.875",
  payment_terms_days: 30,
  quote_prefix: "QT-",
  invoice_prefix: "INV-",
  invoice_design: "classic",
  accent_color: "#073B4C",
  logo: null,
  opening_balance_cents: null,
  opening_balance_on: null,
  updated_at: "2026-10-31T12:00:00Z",
  updated_by: null,
};
const PRODUCT = {
  name: "Front desk kiosk",
  description: null,
  unit_price_cents: 114999,
  active: true,
  created_at: "2026-10-12T12:00:00Z",
  created_by: null,
  updated_at: "2026-10-12T12:00:00Z",
  updated_by: null,
};

const INVOICE = {
  id: 7,
  number: "INV-0042",
  issue_order: 42,
  shows_as: "issued",
  status: "issued",
  deal: { id: 3, name: "Annual support" },
  organization: { id: 2, name: "Harbor & Pine" },
  bill_to: "Harbor & Pine",
  issue_date: "2026-10-31",
  due_date: "2026-11-30",
  total_cents: 100000,
  owed_cents: 100000,
  days_late: null,
  deal_stage: "won",
  company: { name: "Plainsong Systems", address: null, email: null, phone: null },
  tax_label: "Sales tax",
  tax_rate: "0",
  lines: [],
  subtotal_cents: 100000,
  tax_cents: 0,
  paid_cents: 0,
  payments: [],
  issued_by: null,
  voided_by: null,
  voided_at: null,
  created_at: "2026-10-31T12:00:00Z",
  created_by: null,
  updated_at: "2026-10-31T12:00:00Z",
  updated_by: null,
};
const WHO = {
  created_at: "2026-10-12T12:00:00Z",
  created_by: null,
  updated_at: "2026-10-12T12:00:00Z",
  updated_by: null,
};
const DEAL = {
  name: "Harbor & Pine renewal",
  organization_id: null,
  organization_name: null,
  main_contact_id: null,
  main_contact_name: null,
  stage: "proposal",
  value: 24000,
  probability: 40,
  expected_revenue: 9600,
  close_date: "2026-12-01",
  position: 0,
};
const QUOTE = {
  id: 4,
  number: "QT-0004",
  status: "draft",
  deal: { id: 12, name: "Harbor & Pine renewal", stage: "proposal" },
  quote_date: "2026-10-31",
  valid_until: "2026-11-30",
  sent_on: null,
  decided_on: null,
  company: { name: "Plainsong Systems", address: null, email: null, phone: null },
  prepared_for: { organization: null, contact: null, email: null },
  tax_label: null,
  tax_rate: "0",
  lines: [],
  subtotal_cents: 0,
  tax_cents: 0,
  total_cents: 0,
  ...WHO,
};
const BILL = {
  id: 9,
  organization: { id: 1, name: "Northwind Software" },
  bill_number: "INV-0042",
  bill_date: "2026-10-03",
  due_date: "2026-11-02",
  amount_cents: 124000,
  tax_cents: 11005,
  total_cents: 135005,
  category: "software",
  notes: null,
  paid_on: null,
  created_at: "2026-10-04T12:00:00Z",
  created_by: null,
  updated_at: "2026-10-04T12:00:00Z",
  updated_by: null,
};
const NORTHWIND = {
  id: 1,
  name: "Northwind Software",
  website: null,
  industry: "Software",
  notes: null,
  contacts: [],
  deals: [],
  created_at: "2026-01-04T12:00:00Z",
  created_by: null,
  updated_at: "2026-01-04T12:00:00Z",
  updated_by: null,
};

// No opening balance, and no money in or out yet.
const NO_CASH_FLOW = cashFlowReply({ opening: false, months: quietMonths() });
const NO_MONEY = {
  today: "2026-10-31",
  owed: { total_cents: "0", count: 0 },
  overdue: { total_cents: "0", count: 0 },
  due: { total_cents: "0", count: 0, bills: [] },
  months: ["2026-09", "2026-10"].map((month) => ({
    month,
    label: month === "2026-09" ? "Sep" : "Oct",
    total_cents: "0",
    categories: { software: "0", contractors: "0", travel: "0", office: "0", marketing: "0", other: "0" },
  })),
};
const NO_INVOICE_MONEY = {
  owed: { cents: "0", count: 0 },
  overdue: { cents: "0", count: 0 },
  groups: [],
  payments: [
    { month: "2026-09", label: "Sep", cents: "0", count: 0 },
    { month: "2026-10", label: "Oct", cents: "0", count: 0 },
  ],
};
// A won deal and its organization, for the Invoices panels.
const WON_DEAL = {
  id: 3,
  name: "Annual support",
  organization_id: 2,
  organization_name: "Harbor & Pine",
  main_contact_id: null,
  main_contact_name: null,
  stage: "won",
  value: 1000,
  probability: 100,
  expected_revenue: 0,
  close_date: "2026-10-30",
  position: 0,
  ...WHO,
};
const ORGANIZATION = {
  id: 2,
  name: "Harbor & Pine",
  website: null,
  industry: null,
  notes: null,
  contacts: [],
  deals: [],
  ...WHO,
};

let calls: Call[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 12, 0) });
  // Every other read fails, which each page handles in its own way.
  calls = mockApi({
    "GET /meta": META,
    "GET /me": ALEX,
    "GET /local/teammates": [ALEX],
    "POST /local/sign-in": { token: "alex-token" },
    "GET /cash-flow": NO_CASH_FLOW,
    "GET /invoices/money": NO_INVOICE_MONEY,
    "GET /bills/dashboard": NO_MONEY,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Goes to an address the way the browser's back and forward buttons do. */
function visit(path: string) {
  act(() => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

function heading() {
  return screen.findByRole("heading", { level: 1 });
}

function topBar() {
  return within(screen.getByRole("navigation", { name: "Sections" }));
}

/** Stands in for the device's light or dark setting, which jsdom doesn't have. */
function standInDevice(dark: boolean) {
  const listeners = new Set<() => void>();
  const setting = {
    matches: dark,
    addEventListener: (_type: "change", listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: "change", listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", () => setting);
  return {
    turn(darkNow: boolean) {
      setting.matches = darkNow;
      listeners.forEach((listener) => listener());
    },
  };
}

async function signInScreen() {
  await screen.findByRole("heading", { level: 1, name: "Sign in" });
  return screen.findByRole("button", { name: /^Alex Rivera/ });
}

describe("the app, signed out", () => {
  it.each(["/", "/deals/7", "/no/such/page"])(
    "shows the sign-in screen at %s, with no top bar, and keeps the address",
    async (path) => {
      visit(path);
      render(<App />);
      await signInScreen();

      expect(screen.queryByRole("banner")).toBeNull();
      expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
      expect(window.location.pathname).toBe(path);
      // Every other route would refuse without a token.
      expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual(["GET /local/teammates"]);
    },
  );

  it("follows the device from the start when System is saved, before anyone signs in", async () => {
    localStorage.setItem(THEME_KEY, "system");
    const device = standInDevice(false);
    render(<App />);
    await signInScreen();
    expect(document.documentElement.dataset.mode).toBe("light");

    act(() => device.turn(true));

    expect(document.documentElement.dataset.mode).toBe("dark");
  });

  it("opens the page at that address once signed in", async () => {
    visit("/deals");
    render(<App />);

    await user().click(await signInScreen());

    expect((await heading()).textContent).toBe("Deals");
    expect(window.location.pathname).toBe("/deals");
    expect(topBar().getAllByRole("link")).toHaveLength(9);
  });
});

describe("the app, signed in", () => {
  beforeEach(() => startSignedIn());

  it("opens on the Dashboard, with the top bar, its search box and the menu", async () => {
    visit("/");
    render(<App />);
    expect((await heading()).textContent).toBe("Dashboard");
    expect(topBar().getAllByRole("link")).toHaveLength(9);
    const bar = within(screen.getByRole("banner"));
    expect(bar.getByLabelText(SEARCH_BOX)).toBeTruthy();
    expect(await bar.findByRole("button", { name: "Menu for Alex Rivera" })).toBeTruthy();
  });

  it("links the top bar to the nine sections, in order, Quotes, Invoices and Bills last", async () => {
    visit("/");
    render(<App />);
    await heading();
    const links = topBar().getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Dashboard", "/"],
      ["Organizations", "/organizations"],
      ["Contacts", "/contacts"],
      ["Deals", "/deals"],
      ["Pipeline", "/pipeline"],
      ["Products", "/products"],
      ["Quotes", "/quotes"],
      ["Invoices", "/invoices"],
      ["Bills", "/bills"],
    ]);
  });

  it("gives every section an icon of the same size, hidden from screen readers", async () => {
    visit("/");
    render(<App />);
    await heading();
    for (const link of topBar().getAllByRole("link")) {
      const icon = link.querySelector("svg")!;
      expect([icon.getAttribute("width"), icon.getAttribute("aria-hidden")], link.textContent!).toEqual(["17", "true"]);
    }
  });

  it.each([
    ["/organizations", "Organizations"],
    ["/contacts", "Contacts"],
    ["/deals", "Deals"],
    ["/pipeline", "Pipeline"],
    ["/products", "Products"],
    ["/quotes", "Quotes"],
    ["/invoices", "Invoices"],
    ["/bills", "Bills"],
  ])("gives %s its own address", async (path, title) => {
    render(<App />);
    visit(path);
    expect((await heading()).textContent).toBe(title);
    expect(window.location.pathname).toBe(path);
  });

  it.each([
    ["/organizations/abc", "This organization no longer exists", "Back to Organizations"],
    ["/contacts/abc", "This contact no longer exists", "Back to Contacts"],
    ["/deals/abc", "This deal no longer exists", "Back to Deals"],
    ["/products/abc", "This product no longer exists", "Back to Products"],
    ["/quotes/abc", "This quote no longer exists", "Back to Quotes"],
    ["/quotes/new?deal=abc", "This deal no longer exists", "Back to Quotes"],
    ["/invoices/abc", "This invoice no longer exists", "Back to Invoices"],
    ["/bills/abc", "This bill no longer exists", "Back to Bills"],
  ])("says %s couldn't be a record, with a link back to its section", async (path, title, back) => {
    render(<App />);
    visit(path);
    expect((await heading()).textContent).toBe(title);
    expect(screen.getByRole("link", { name: back })).toBeTruthy();
  });

  it("opens a product's page at its address", async () => {
    mockApi({ "GET /me": ALEX, "GET /meta": META, "GET /products/7": { ...PRODUCT, id: 7 } });
    render(<App />);
    visit("/products/7");
    expect((await heading()).textContent).toBe("Front desk kiosk");
    expect(screen.getByText("$1,149.99")).toBeTruthy();
  });

  it("opens a quote's page at its address, and a new draft's for a deal", async () => {
    mockApi({
      "GET /me": ALEX,
      "GET /meta": META,
      "GET /quotes/4": QUOTE,
      "GET /quotes?deal_id=12": [],
      "GET /quotes/new/12": {
        deal: QUOTE.deal,
        company: QUOTE.company,
        prepared_for: QUOTE.prepared_for,
        tax_label: null,
        tax_rate: "0",
      },
      "GET /products": [],
      "GET /settings": SETTINGS,
    });
    render(<App />);
    visit("/quotes/4");
    expect((await heading()).textContent).toBe("QT-0004");
    expect(topBar().getByRole("link", { name: "Quotes" }).getAttribute("aria-current")).toBe("page");
    visit("/quotes/new?deal=12");
    expect((await screen.findByRole("heading", { level: 1, name: "New quote" })).textContent).toBe("New quote");
  });

  it.each([
    ["/deals/12", { ...DEAL, id: 12 }, "/quotes?deal_id=12"],
    [
      "/organizations/3",
      { id: 3, name: "Harbor & Pine", website: null, industry: null, notes: null, contacts: [], deals: [] },
      "/quotes?organization_id=3",
    ],
  ])("gives %s a Quotes panel", async (path, record, quotes) => {
    mockApi({
      "GET /me": ALEX,
      "GET /meta": META,
      [`GET ${path}`]: { ...record, ...WHO },
      [`GET ${path}/timeline?limit=20&offset=0`]: { entries: [], total: 0 },
      [`GET ${quotes}`]: [],
    });
    render(<App />);
    visit(path);
    const panel = within(await screen.findByRole("region", { name: "Quotes" }));
    expect(await panel.findByText("No quotes yet.")).toBeTruthy();
  });

  it("has the Money section on the dashboard, below its own part", async () => {
    visit("/");
    render(<App />);
    expect((await heading()).textContent).toBe("Dashboard");
    const money = within(await screen.findByRole("region", { name: "Money" }));
    expect((await money.findByRole("link", { name: /^What we owe/ })).textContent).toBe(
      "What we owe$0.000 unpaid bills",
    );
    expect(await money.findByText("Nothing owed.")).toBeTruthy();
    expect(await money.findByText("Cash flow will show here once money comes in or goes out.")).toBeTruthy();
    // One section for all three: the cash flow across its top, then what customers owe us, from
    // invoices, beside what we owe, from bills.
    const regions = money
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-label") ?? region.querySelector("h3")?.textContent);
    expect(regions).toEqual(["Cash flow", "Owed to us", "Payments received", "What we owe", "Spending by category"]);
    expect(screen.getAllByRole("heading", { level: 2, name: "Money" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2 }).at(-1)?.textContent).toBe("Money");
  });

  it("keeps one side of the Money section showing when the other can't load", async () => {
    mockApi({
      "GET /me": ALEX,
      "GET /meta": META,
      "GET /cash-flow": NO_CASH_FLOW,
      "GET /invoices/money": () => ({ status: 500, body: { detail: "Something went wrong." } }),
      "GET /bills/dashboard": NO_MONEY,
    });
    visit("/");
    render(<App />);
    const money = within(await screen.findByRole("region", { name: "Money" }));
    expect(await money.findByText("Couldn't load this.")).toBeTruthy();
    expect(money.queryByRole("region", { name: "Owed to us" })).toBeNull();
    expect(await money.findByRole("link", { name: /^What we owe/ })).toBeTruthy();
    expect(money.getByRole("region", { name: "Spending by category" })).toBeTruthy();
  });

  it("keeps both sides of the Money section showing when the cash flow can't load", async () => {
    mockApi({
      "GET /me": ALEX,
      "GET /meta": META,
      "GET /cash-flow": () => ({ status: 500, body: { detail: "Something went wrong." } }),
      "GET /invoices/money": NO_INVOICE_MONEY,
      "GET /bills/dashboard": NO_MONEY,
    });
    visit("/");
    render(<App />);
    const money = within(await screen.findByRole("region", { name: "Money" }));
    const cashFlow = within(money.getByRole("region", { name: "Cash flow" }));
    expect(await cashFlow.findByText("Couldn't load this.")).toBeTruthy();
    expect(await money.findByRole("link", { name: /^What we owe/ })).toBeTruthy();
    expect(await money.findByText("Nothing owed.")).toBeTruthy();
    expect(money.getAllByText("Couldn't load this.")).toHaveLength(1);
  });

  it("opens a bill's page at its address", async () => {
    mockApi({ "GET /me": ALEX, "GET /meta": META, "GET /bills/9": BILL });
    render(<App />);
    visit("/bills/9");
    expect((await heading()).textContent).toBe("Bill INV-0042");
    expect(screen.getByText("$1,350.05")).toBeTruthy();
    expect(topBar().getByRole("link", { current: "page" }).textContent).toBe("Bills");
  });

  it("shows an organization's bills on its page, below its own panels", async () => {
    mockApi({
      "GET /me": ALEX,
      "GET /meta": META,
      "GET /organizations/1": NORTHWIND,
      "GET /organizations/1/timeline?limit=50&offset=0": { entries: [], total: 0 },
      "GET /quotes?organization_id=1": [],
      "GET /invoices?organization_id=1": [],
      "GET /bills?organization_id=1": [BILL],
    });
    render(<App />);
    visit("/organizations/1");
    expect((await heading()).textContent).toBe("Northwind Software");
    const panels = screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"));
    expect(panels.slice(0, 6)).toEqual(["Details", "Contacts", "Deals", "Quotes", "Invoices", "Bills"]);
    const bills = within(screen.getByRole("region", { name: "Bills" }));
    expect((await bills.findByRole("link", { name: "INV-0042" })).getAttribute("href")).toBe("/bills/9");
  });

  it("opens an invoice's page at its address, and says when one no longer exists", async () => {
    mockApi({
      "GET /me": ALEX,
      "GET /meta": META,
      "GET /settings": SETTINGS,
      "GET /invoices/7": INVOICE,
      "GET /invoices/8": () => ({ status: 404, body: { detail: "Invoice not found" } }),
    });
    render(<App />);
    visit("/invoices/7");
    expect((await heading()).textContent).toBe("INV-0042");
    visit("/invoices/8");
    expect((await screen.findByRole("heading", { level: 1, name: "This invoice no longer exists" })).textContent).toBe(
      "This invoice no longer exists",
    );
  });

  it("puts the Invoices panel on a deal's and an organization's page, and Money below the dashboard", async () => {
    mockApi({
      "GET /me": ALEX,
      "GET /meta": META,
      "GET /deals/3": WON_DEAL,
      "GET /deals/3/timeline?limit=50&offset=0": { entries: [], total: 0 },
      "GET /invoices?deal_id=3": [],
      "GET /organizations/2": ORGANIZATION,
      "GET /organizations/2/timeline?limit=50&offset=0": { entries: [], total: 0 },
      "GET /invoices?organization_id=2": [],
    });
    render(<App />);
    visit("/deals/3");
    expect(await screen.findByRole("region", { name: "Invoices" })).toBeTruthy();
    expect(await screen.findByText("No invoices yet.")).toBeTruthy();
    visit("/organizations/2");
    expect(await screen.findByRole("region", { name: "Invoices" })).toBeTruthy();
    visit("/");
    expect(await screen.findByRole("heading", { level: 2, name: "Money" })).toBeTruthy();
  });

  it("says an unknown address no longer exists, links to the Dashboard and keeps the top bar", async () => {
    render(<App />);
    visit("/no/such/page");
    expect((await heading()).textContent).toBe("This page no longer exists");
    expect(topBar().getAllByRole("link")).toHaveLength(9);

    await user().click(screen.getByRole("link", { name: "Back to Dashboard" }));

    expect((await heading()).textContent).toBe("Dashboard");
    expect(window.location.pathname).toBe("/");
  });

  it("opens the Company settings page at /settings, inside the top bar, with no section marked", async () => {
    mockApi({ "GET /meta": META, "GET /me": ALEX, "GET /settings": SETTINGS });
    render(<App />);
    visit("/settings");
    expect((await heading()).textContent).toBe("Company settings");
    expect(window.location.pathname).toBe("/settings");
    expect(topBar().getAllByRole("link")).toHaveLength(9);
    expect(topBar().queryByRole("link", { current: "page" })).toBeNull();
    expect(await screen.findByLabelText("Company name")).toBeTruthy();
  });

  it.each([
    ["/accounting/profit-and-loss", "Profit and loss", "What the business earned"],
    ["/accounting/journal", "Journal", "Every entry in the books"],
    ["/accounting/aged-balances", "Aged balances", "What customers owe"],
  ])("opens %s inside the top bar, with no section marked", async (address, title, words) => {
    mockApi({ "GET /meta": META, "GET /me": ALEX });
    render(<App />);
    visit(address);
    expect((await heading()).textContent).toBe(title);
    expect(screen.getByText("This report is coming soon.")).toBeTruthy();
    expect(screen.getByText(new RegExp(words))).toBeTruthy();
    expect(topBar().getAllByRole("link")).toHaveLength(9);
    expect(topBar().queryByRole("link", { current: "page" })).toBeNull();
  });

  it("opens Profit and loss at /accounting, replacing that address", async () => {
    mockApi({ "GET /meta": META, "GET /me": ALEX });
    render(<App />);
    visit("/accounting");
    expect((await heading()).textContent).toBe("Profit and loss");
    expect(window.location.pathname).toBe("/accounting/profit-and-loss");
  });

  it("says an address under /accounting that isn't a page no longer exists, keeping the top bar", async () => {
    mockApi({ "GET /meta": META, "GET /me": ALEX });
    render(<App />);
    visit("/accounting/trial-balance");
    expect((await heading()).textContent).toBe("This page no longer exists");
    expect(topBar().getAllByRole("link")).toHaveLength(9);
  });

  it("gets the menu's Accounting links from App.tsx, and opens a page from one", async () => {
    const days = stops(todayIso()).map((stop) => [`GET /books/balances?on=${stop.day}`, balancesReply(stop.day)]);
    mockApi({ "GET /meta": META, "GET /me": ALEX, ...Object.fromEntries(days) });
    render(<App />);
    visit("/");
    await heading();
    const clicks = user();
    await clicks.click(await screen.findByRole("button", { name: "Menu for Alex Rivera" }));

    await clicks.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Balance sheet" }));

    expect((await heading()).textContent).toBe("Balance sheet");
    expect(window.location.pathname).toBe("/accounting/balance-sheet");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("goes to a section from the top bar", async () => {
    visit("/");
    render(<App />);
    await heading();

    await user().click(topBar().getByRole("link", { name: "Contacts" }));

    expect((await heading()).textContent).toBe("Contacts");
    expect(window.location.pathname).toBe("/contacts");
  });
});
