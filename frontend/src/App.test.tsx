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

let calls: Call[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 12, 0) });
  // Every other read fails, which each page handles in its own way.
  calls = mockApi({
    "GET /meta": META,
    "GET /me": ALEX,
    "GET /local/teammates": [ALEX],
    "POST /local/sign-in": { token: "alex-token" },
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
    expect(topBar().getAllByRole("link")).toHaveLength(6);
  });
});

describe("the app, signed in", () => {
  beforeEach(() => startSignedIn());

  it("opens on the Dashboard, with the top bar, its search box and the menu", async () => {
    visit("/");
    render(<App />);
    expect((await heading()).textContent).toBe("Dashboard");
    expect(topBar().getAllByRole("link")).toHaveLength(6);
    const bar = within(screen.getByRole("banner"));
    expect(bar.getByLabelText(SEARCH_BOX)).toBeTruthy();
    expect(await bar.findByRole("button", { name: "Menu for Alex Rivera" })).toBeTruthy();
  });

  it.each([
    ["/organizations", "Organizations"],
    ["/contacts", "Contacts"],
    ["/deals", "Deals"],
    ["/pipeline", "Pipeline"],
    ["/products", "Products"],
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

  it("says an unknown address no longer exists, links to the Dashboard and keeps the top bar", async () => {
    render(<App />);
    visit("/no/such/page");
    expect((await heading()).textContent).toBe("This page no longer exists");
    expect(topBar().getAllByRole("link")).toHaveLength(6);

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
    expect(topBar().getAllByRole("link")).toHaveLength(6);
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
