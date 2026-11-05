import { defaultScheduler, notifyManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { holdSaves, mockApi, renderApp, user, type Call } from "../test-utils";
import type { SampleLook } from "./documentPreview";
import type { CompanySettings } from "./settings";
import { SettingsPage } from "./SettingsPage";

const DANA = { id: "teammate-dana-whitfield", name: "Dana Whitfield" };
const ALEX = { id: "teammate-alex-rivera", name: "Alex Rivera" };

// Midday in UTC, so the day is the same in any time zone the tests run in.
const SAMPLE: CompanySettings = {
  company_name: "Plainsong Systems",
  address: "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
  email: "accounts@plainsong.example",
  phone: "(718) 555-0142",
  tax_label: "Sales tax",
  tax_rate: "8.875",
  payment_terms_days: 30,
  quote_prefix: "QT-",
  invoice_prefix: "INV-",
  invoice_design: "banner",
  accent_color: "#0E6B6B",
  logo: null,
  updated_at: "2026-11-05T12:00:00Z",
  updated_by: DANA,
};

// B13: what a database that already existed starts with.
const DEFAULTS: CompanySettings = {
  company_name: null,
  address: null,
  email: null,
  phone: null,
  tax_label: "Sales tax",
  tax_rate: "0",
  payment_terms_days: 30,
  quote_prefix: "QT-",
  invoice_prefix: "INV-",
  invoice_design: "classic",
  accent_color: "#073B4C",
  logo: null,
  updated_at: "2026-11-01T12:00:00Z",
  updated_by: null,
};

/** Stands in for the invoices area's sample, which App.tsx hands the page, saying what it was given. */
function Preview({ look }: { look: SampleLook }) {
  return (
    <p data-testid="preview">
      {look.design} {look.accent} {look.logo ? `logo ${look.logo.width}x${look.logo.height}` : "no logo"}
    </p>
  );
}

const BOXES = [
  "Company name",
  "Address",
  "Email",
  "Phone",
  "Tax label",
  "Tax rate",
  "Payment terms",
  "Quote prefix",
  "Invoice prefix",
];

function box(label: string) {
  return screen.getByLabelText<HTMLInputElement>(label);
}

function saveButton() {
  return screen.getByRole("button", { name: "Save settings" });
}

/** The page, once the settings have been read. */
async function open(routes: Record<string, unknown>) {
  const calls = mockApi({ "GET /settings": SAMPLE, ...routes });
  const view = renderApp(<SettingsPage preview={Preview} />);
  await screen.findByLabelText("Company name");
  return { calls, ...view };
}

/** Pastes the text in, which is quicker than typing it a key at a time. */
async function retype(label: string, text: string) {
  const keys = user();
  await keys.clear(box(label));
  if (text) await keys.paste(text);
}

/** A backend that starts with these settings and, once saved, replies with and keeps the saved ones. */
function savingBackend(start: CompanySettings, saved: CompanySettings) {
  let current = start;
  return {
    "GET /settings": () => ({ body: current }),
    "PATCH /settings": () => {
      current = saved;
      return { body: saved };
    },
  };
}

function patches(calls: Call[]) {
  return calls.filter((call) => call.method === "PATCH" && call.path === "/settings");
}

function messageBeside(label: string) {
  return box(label).closest("div.flex-col")?.querySelector('[role="alert"]')?.textContent;
}

/**
 * Holds back TanStack Query's news that the settings changed, so the page goes on with the ones it
 * last heard of until released. The news comes on a timer, which a save's reply can beat.
 */
function holdNews() {
  const held: (() => void)[] = [];
  notifyManager.setScheduler((news) => held.push(news));
  onTestFinished(() => notifyManager.setScheduler(defaultScheduler));
  return () =>
    act(() => {
      notifyManager.setScheduler(defaultScheduler);
      for (const news of held) news();
    });
}

/** Every value the page puts in a box from now on, so a value it shows only for a moment is caught too. */
function valuesPutIn(input: HTMLInputElement) {
  const put: string[] = [];
  const { get, set } = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") ?? {};
  Object.defineProperty(input, "value", {
    configurable: true,
    get: () => get?.call(input),
    set: (value: string) => {
      put.push(value);
      set?.call(input, value);
    },
  });
  return put;
}

describe("the Company settings page", () => {
  it("fills every box from the settings", async () => {
    await open({});
    expect(screen.getByRole("heading", { level: 1, name: "Company settings" })).toBeTruthy();
    expect(BOXES.map((label) => box(label).value)).toEqual([
      "Plainsong Systems",
      "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
      "accounts@plainsong.example",
      "(718) 555-0142",
      "Sales tax",
      "8.875",
      "30",
      "QT-",
      "INV-",
    ]);
  });

  it("has a panel for the company, for tax and for quotes and invoices", async () => {
    await open({});
    const panel = (name: string) => within(screen.getByRole("region", { name }));
    expect(panel("Company").getByLabelText("Address")).toBeTruthy();
    expect(panel("Tax").getByLabelText("Tax rate")).toBeTruthy();
    expect(panel("Quotes and invoices").getByLabelText("Invoice prefix")).toBeTruthy();
  });

  it("says what the rate and the terms are in, and hints at what a prefix can hold", async () => {
    await open({});
    expect(box("Tax rate").nextElementSibling?.textContent).toBe("%");
    expect(box("Payment terms").nextElementSibling?.textContent).toBe("days");
    for (const name of ["Quote prefix", "Invoice prefix"]) {
      expect(screen.getByRole("textbox", { name, description: "Up to 10 letters, digits and hyphens." })).toBeTruthy();
    }
  });

  it("says who last changed the settings and when", async () => {
    await open({});
    expect(screen.getByText(/^Last changed by Dana Whitfield on/).textContent).toBe(
      "Last changed by Dana Whitfield on Nov 5, 2026",
    );
  });

  it("shows nobody as having changed settings nobody has saved, and asks for the company name", async () => {
    await open({ "GET /settings": DEFAULTS });
    expect(screen.queryByText(/Last changed/)).toBeNull();
    expect(screen.getByText("No company name yet. Enter one below.")).toBeTruthy();
    expect(box("Company name").value).toBe("");
    expect(box("Tax rate").value).toBe("0");
  });

  it("stops asking for the company name once one is saved", async () => {
    const { calls } = await open(
      savingBackend(DEFAULTS, { ...DEFAULTS, company_name: "Plainsong Systems", updated_by: ALEX }),
    );
    await retype("Company name", "Plainsong Systems");
    await user().click(saveButton());

    await waitFor(() => expect(screen.queryByText("No company name yet. Enter one below.")).toBeNull());
    expect(patches(calls)).toHaveLength(1);
  });
});

describe("checking before saving", () => {
  it.each([
    ["Company name", "", "Enter the company name"],
    ["Tax rate", "150", "Enter a rate from 0 to 100%"],
    ["Tax rate", "8.8751", "Use at most three decimal places"],
    ["Payment terms", "400", "Enter a whole number of days from 0 to 365"],
    ["Quote prefix", "QT_", "Use up to 10 letters, digits and hyphens"],
    ["Invoice prefix", "", "Enter a prefix, such as INV-"],
    ["Email", "accounts", "Enter a valid email address"],
  ])("shows a %s of %j its message, and sends nothing", async (label, typed, message) => {
    const { calls } = await open({});
    await retype(label, typed);
    await user().click(saveButton());

    expect(await screen.findByText(message)).toBeTruthy();
    expect(messageBeside(label)).toBe(message);
    expect(box(label).getAttribute("aria-invalid")).toBe("true");
    expect(patches(calls)).toEqual([]);
  });

  it("shows a prefix's error in place of its hint", async () => {
    await open({});
    await retype("Quote prefix", "QT_");
    await user().click(saveButton());
    await screen.findByText("Use up to 10 letters, digits and hyphens");
    expect(screen.getAllByText("Up to 10 letters, digits and hyphens.")).toHaveLength(1);
  });

  it("refuses prefixes that clash, beside the invoice prefix, and sends nothing", async () => {
    const { calls } = await open({});
    await retype("Invoice prefix", "inv-");
    await retype("Quote prefix", "INV-");
    await user().click(saveButton());

    const clash = "Clashes with the quote prefix. Neither can start with the other, ignoring capitals";
    expect(await screen.findByText(clash)).toBeTruthy();
    expect(messageBeside("Invoice prefix")).toBe(clash);
    expect(patches(calls)).toEqual([]);
  });

  it("puts the backend's messages beside their fields", async () => {
    await open({
      "PATCH /settings": () => ({
        status: 422,
        body: {
          detail: "Check the form.",
          fields: { invoice_prefix: "Clashes with the quote prefix", tax_rate: "Too high" },
        },
      }),
    });
    await user().click(saveButton());

    expect(await screen.findByText("Too high")).toBeTruthy();
    expect(messageBeside("Tax rate")).toBe("Too high");
    expect(messageBeside("Invoice prefix")).toBe("Clashes with the quote prefix");
  });
});

describe("saving", () => {
  it("sends every field, the rate as typed and the terms as a number", async () => {
    const { calls } = await open({ "PATCH /settings": SAMPLE });
    await retype("Tax rate", " 8.50 ");
    await retype("Payment terms", "45");
    await retype("Phone", "");
    await user().click(saveButton());

    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0].body).toEqual({
      company_name: "Plainsong Systems",
      address: "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
      email: "accounts@plainsong.example",
      phone: null,
      tax_label: "Sales tax",
      tax_rate: "8.50",
      payment_terms_days: 45,
      quote_prefix: "QT-",
      invoice_prefix: "INV-",
      invoice_design: "banner",
      accent_color: "#0E6B6B",
    });
  });

  it("saves once, however quickly Save settings is pressed, says so and shows who saved", async () => {
    const saved = vi.spyOn(toast, "success");
    const { calls } = await open(
      savingBackend(SAMPLE, { ...SAMPLE, tax_rate: "8.5", updated_by: ALEX, updated_at: "2026-11-06T12:00:00Z" }),
    );
    await retype("Tax rate", "8.50");
    const release = holdSaves();
    // Two presses with nothing between them, before the page can redraw and disable the button.
    fireEvent.click(saveButton());
    fireEvent.click(saveButton());
    release();

    await waitFor(() => expect(saved).toHaveBeenCalledWith("Settings saved."));
    expect(patches(calls)).toHaveLength(1);
    expect(screen.getByText(/^Last changed by/).textContent).toBe("Last changed by Alex Rivera on Nov 6, 2026");
    // The form shows the rate as saved, without its trailing zero (B7).
    expect(box("Tax rate").value).toBe("8.5");
  });

  it("shows what was saved, never the settings from before, however late the page hears of the save", async () => {
    const saved = vi.spyOn(toast, "success");
    await open(savingBackend(SAMPLE, { ...SAMPLE, tax_rate: "8.5", updated_by: ALEX }));
    await retype("Tax rate", "8.50");
    const shown = valuesPutIn(box("Tax rate"));
    const hear = holdNews();
    await user().click(saveButton());

    await waitFor(() => expect(saved).toHaveBeenCalledWith("Settings saved."));
    // The form has taken the reply, and the page still has the settings from before the save.
    await waitFor(() => expect(box("Tax rate").value).toBe("8.5"));
    await hear();
    expect(screen.getByText(/^Last changed by/).textContent).toMatch(/^Last changed by Alex Rivera/);
    expect(box("Tax rate").value).toBe("8.5");
    expect(shown).not.toContain("8.875");
  });

  it("saves when Enter is pressed in a one-line box", async () => {
    const { calls } = await open({ "PATCH /settings": SAMPLE });
    await user().type(box("Phone"), "{Enter}");
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
  });

  it("starts a new line when Enter is pressed in the address box, rather than saving", async () => {
    const { calls } = await open({ "PATCH /settings": SAMPLE });
    await user().type(box("Address"), "{Enter}USA");
    expect(box("Address").value).toBe("48 Orchard Row, Suite 210\nBrooklyn, NY 11201\nUSA");
    expect(patches(calls)).toEqual([]);
  });

  it("keeps what's typed while a save is on its way, still to be saved, and shows the rest as saved", async () => {
    const saved = vi.spyOn(toast, "success");
    let current = SAMPLE;
    const afterSave = { ...SAMPLE, tax_rate: "8.5", updated_by: ALEX };
    const { calls, client } = await open({
      "GET /settings": () => ({ body: current }),
      "PATCH /settings": () => {
        current = afterSave;
        return { body: afterSave };
      },
    });
    await retype("Tax rate", "8.50");
    const release = holdSaves();
    await user().click(saveButton());
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", true));
    await retype("Phone", "(718) 555-0199");
    release();

    await waitFor(() => expect(saved).toHaveBeenCalledWith("Settings saved."));
    expect(box("Tax rate").value).toBe("8.5");
    expect(box("Phone").value).toBe("(718) 555-0199");

    // Not saved yet, so a teammate's newer save leaves it alone (B10), and the next save sends it.
    current = { ...afterSave, updated_by: DANA };
    await act(() => client.refetchQueries());
    await screen.findByText(/^Last changed by Dana Whitfield/);
    expect(box("Phone").value).toBe("(718) 555-0199");
    await user().click(saveButton());
    await waitFor(() => expect(patches(calls)).toHaveLength(2));
    expect(patches(calls)[1].body).toMatchObject({ phone: "(718) 555-0199", tax_rate: "8.5" });
  });

  it("keeps what was typed when the save fails, and says so", async () => {
    const failed = vi.spyOn(toast, "error");
    await open({ "PATCH /settings": () => ({ status: 500, body: { detail: "Something went wrong." } }) });
    await retype("Company name", "Plainsong Studios");
    await user().click(saveButton());

    await waitFor(() => expect(failed).toHaveBeenCalledWith("Something went wrong."));
    expect(box("Company name").value).toBe("Plainsong Studios");
  });
});

describe("reading the settings", () => {
  it("says so if they can't be read, offers Try again, and shows no form to save blanks from", async () => {
    let broken = true;
    mockApi({
      "GET /settings": () => (broken ? { status: 500, body: { detail: "Something went wrong." } } : { body: SAMPLE }),
    });
    renderApp(<SettingsPage preview={Preview} />);

    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull();

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect((await screen.findByLabelText<HTMLInputElement>("Company name")).value).toBe("Plainsong Systems");
  });

  it("keeps the form if a later read fails, and says it may be out of date", async () => {
    let broken = false;
    const { client } = await open({
      "GET /settings": () => (broken ? { status: 500, body: { detail: "Something went wrong." } } : { body: SAMPLE }),
    });
    broken = true;
    await act(() => client.refetchQueries());

    expect(await screen.findByText("Couldn't refresh this, so it may be out of date.")).toBeTruthy();
    expect(box("Company name").value).toBe("Plainsong Systems");
  });

  it("fills an untouched form with a teammate's newer save", async () => {
    let current = SAMPLE;
    const { client } = await open({ "GET /settings": () => ({ body: current }) });
    current = { ...SAMPLE, phone: "(718) 555-0199", updated_by: ALEX };
    await act(() => client.refetchQueries());

    await waitFor(() => expect(box("Phone").value).toBe("(718) 555-0199"));
    expect(screen.getByText(/^Last changed by Alex Rivera/)).toBeTruthy();
  });

  it("leaves what's being typed alone when a teammate's newer save arrives", async () => {
    let current = SAMPLE;
    const { client } = await open({ "GET /settings": () => ({ body: current }) });
    await retype("Company name", "Plainsong Studios");
    current = { ...SAMPLE, phone: "(718) 555-0199", updated_by: ALEX };
    await act(() => client.refetchQueries());

    await screen.findByText(/^Last changed by Alex Rivera/);
    expect(box("Company name").value).toBe("Plainsong Studios");
    expect(box("Phone").value).toBe("(718) 555-0142");
  });
});
