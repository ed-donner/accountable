import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
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

const NO_MONEY = {
  today: "2026-10-31",
  owed: { total_cents: "0", count: 0 },
  overdue: { total_cents: "0", count: 0 },
  due: { total_cents: "0", count: 0, bills: [] },
  months: [],
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
    expect(topBar().getAllByRole("link")).toHaveLength(8);
  });
});

describe("the app, signed in", () => {
  beforeEach(() => startSignedIn());

  it("opens on the Dashboard, with the top bar, its search box and the menu", async () => {
    visit("/");
    render(<App />);
    expect((await heading()).textContent).toBe("Dashboard");
    expect(topBar().getAllByRole("link")).toHaveLength(8);
    const bar = within(screen.getByRole("banner"));
    expect(bar.getByLabelText(SEARCH_BOX)).toBeTruthy();
    expect(await bar.findByRole("button", { name: "Menu for Alex Rivera" })).toBeTruthy();
  });

  it("links the top bar to the eight sections, in order, Quotes and Bills last", async () => {
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
    const money = await screen.findByRole("region", { name: "Money" });
    expect(within(money).getByRole("link", { name: /^What we owe/ }).textContent).toBe(
      "What we owe$0.000 unpaid bills",
    );
    expect(screen.getAllByRole("heading", { level: 2 }).at(-1)?.textContent).toBe("Money");
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
      "GET /bills?organization_id=1": [BILL],
    });
    render(<App />);
    visit("/organizations/1");
    expect((await heading()).textContent).toBe("Northwind Software");
    const panels = screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"));
    expect(panels.slice(0, 5)).toEqual(["Details", "Contacts", "Deals", "Quotes", "Bills"]);
    const bills = within(screen.getByRole("region", { name: "Bills" }));
    expect((await bills.findByRole("link", { name: "INV-0042" })).getAttribute("href")).toBe("/bills/9");
  });

  it("says an unknown address no longer exists, links to the Dashboard and keeps the top bar", async () => {
    render(<App />);
    visit("/no/such/page");
    expect((await heading()).textContent).toBe("This page no longer exists");
    expect(topBar().getAllByRole("link")).toHaveLength(8);

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
    expect(topBar().getAllByRole("link")).toHaveLength(8);
    expect(topBar().queryByRole("link", { current: "page" })).toBeNull();
    expect(await screen.findByLabelText("Company name")).toBeTruthy();
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
