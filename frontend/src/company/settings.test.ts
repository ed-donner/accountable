import { describe, expect, it } from "vitest";

import cases from "../../../shared/settings-cases.json";
import {
  CLASH_MESSAGE,
  COMPANY_NAME_MESSAGE,
  INVOICE_PREFIX_BLANK_MESSAGE,
  OPENING_AMOUNT_MESSAGE,
  OPENING_AMOUNT_MISSING_MESSAGE,
  OPENING_DATE_FUTURE_MESSAGE,
  OPENING_DATE_MESSAGE,
  OPENING_LIMIT_MESSAGE,
  PAYMENT_TERMS_MESSAGE,
  PREFIX_CHARACTERS_MESSAGE,
  QUOTE_PREFIX_BLANK_MESSAGE,
  RATE_DECIMALS_MESSAGE,
  RATE_RANGE_MESSAGE,
  paymentTermsProblem,
  prefixProblem,
  prefixesClash,
  settingsProblems,
  toForm,
  toRequest,
  taxRateProblem,
  type CompanySettings,
  type SettingsValues,
} from "./settings";

const RATE_MESSAGES: Record<string, string> = { range: RATE_RANGE_MESSAGE, decimals: RATE_DECIMALS_MESSAGE };
const PREFIX_MESSAGES: Record<string, string> = {
  blank: QUOTE_PREFIX_BLANK_MESSAGE,
  characters: PREFIX_CHARACTERS_MESSAGE,
};

const ACCEPTED_RATES = cases.tax_rates.accepted.map(([typed]) => String(typed));
const REFUSED_RATES = cases.tax_rates.refused as [string, string][];
const ACCEPTED_PREFIXES = cases.prefixes.accepted.map(([typed]) => typed);
const REFUSED_PREFIXES = cases.prefixes.refused as [string, string][];
const CLASHES = cases.clashes as [string, string, boolean][];

const FILLED: SettingsValues = {
  company_name: "Plainsong Systems",
  address: "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
  email: "accounts@plainsong.example",
  phone: "(718) 555-0142",
  tax_label: "Sales tax",
  tax_rate: "8.875",
  payment_terms_days: "30",
  quote_prefix: "QT-",
  invoice_prefix: "INV-",
  invoice_design: "banner",
  accent_color: "#0e6b6b",
  logo: { kind: "kept" },
  opening_balance_cents: "40,000.00",
  opening_balance_on: "2025-12-01",
};
const TODAY = "2026-11-05";
// The opening balance's date as the settings were last saved.
const SAVED_ON = FILLED.opening_balance_on;

describe("the tax rate", () => {
  it.each(ACCEPTED_RATES)("accepts %j, as the backend does", (typed) => {
    expect(taxRateProblem(typed)).toBeUndefined();
  });

  it.each(REFUSED_RATES)("refuses %j with the backend's message for %s", (typed, message) => {
    expect(taxRateProblem(typed)).toBe(RATE_MESSAGES[message]);
  });
});

describe("the payment terms", () => {
  it.each(["0", "30", "365", " 45 "])("accepts %j days", (days) => {
    expect(paymentTermsProblem(days)).toBeUndefined();
  });

  it.each(["-1", "366", "400", "30.5", "", "thirty", "1e2"])("refuses %j days", (days) => {
    expect(paymentTermsProblem(days)).toBe(PAYMENT_TERMS_MESSAGE);
  });
});

describe("a prefix", () => {
  it.each(ACCEPTED_PREFIXES)("accepts %j, as the backend does", (typed) => {
    expect(prefixProblem(typed, QUOTE_PREFIX_BLANK_MESSAGE)).toBeUndefined();
  });

  it.each(REFUSED_PREFIXES)("refuses %j with the backend's message for %s", (typed, message) => {
    expect(prefixProblem(typed, QUOTE_PREFIX_BLANK_MESSAGE)).toBe(PREFIX_MESSAGES[message]);
  });

  it("names the invoice's own example when the invoice prefix is blank", () => {
    expect(prefixProblem("", INVOICE_PREFIX_BLANK_MESSAGE)).toBe("Enter a prefix, such as INV-");
  });

  it.each(CLASHES)("with a quote prefix of %j and an invoice prefix of %j, clashes: %s", (quote, invoice, clash) => {
    expect(prefixesClash(quote, invoice)).toBe(clash);
    expect(prefixesClash(invoice, quote)).toBe(clash);
  });
});

describe("the whole form's checks", () => {
  it("finds nothing wrong with the sample company", () => {
    expect(Object.values(settingsProblems(FILLED, TODAY, SAVED_ON)).filter(Boolean)).toEqual([]);
  });

  it("gives every bad field its message at once", () => {
    const problems = settingsProblems(
      {
        ...FILLED,
        company_name: " ",
        email: "accounts",
        tax_rate: "150",
        payment_terms_days: "400",
        quote_prefix: "QT_",
      },
      TODAY,
      SAVED_ON,
    );
    expect(problems).toMatchObject({
      company_name: COMPANY_NAME_MESSAGE,
      email: "Enter a valid email address",
      tax_rate: RATE_RANGE_MESSAGE,
      payment_terms_days: PAYMENT_TERMS_MESSAGE,
      quote_prefix: PREFIX_CHARACTERS_MESSAGE,
    });
  });

  it("puts a clash on the invoice prefix", () => {
    expect(settingsProblems({ ...FILLED, invoice_prefix: "qt-" }, TODAY, SAVED_ON).invoice_prefix).toBe(CLASH_MESSAGE);
  });

  it("leaves the blank optional fields alone", () => {
    const problems = settingsProblems({ ...FILLED, address: "", email: "", phone: "", tax_label: "" }, TODAY, SAVED_ON);
    expect(Object.values(problems).filter(Boolean)).toEqual([]);
  });
});

describe("what a save sends", () => {
  it("sends the rate as the typed text, without the spaces at its ends", () => {
    expect(toRequest({ ...FILLED, tax_rate: " 8.8750 " }).tax_rate).toBe("8.8750");
  });

  it("sends the payment terms as a number", () => {
    expect(toRequest({ ...FILLED, payment_terms_days: " 45 " }).payment_terms_days).toBe(45);
  });

  it("sends blank optional fields as null, and keeps the address's lines", () => {
    const sent = toRequest({ ...FILLED, email: "  ", phone: "", tax_label: " " });
    expect([sent.email, sent.phone, sent.tax_label]).toEqual([null, null, null]);
    expect(sent.address).toBe("48 Orchard Row, Suite 210\nBrooklyn, NY 11201");
  });

  it("fills the form from settings nobody has saved, with blanks for what isn't there", () => {
    const settings: CompanySettings = {
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
      opening_balance_cents: null,
      opening_balance_on: null,
      updated_at: "2026-11-05T14:03:00Z",
      updated_by: null,
    };
    expect(toForm(settings)).toEqual({
      company_name: "",
      address: "",
      email: "",
      phone: "",
      tax_label: "Sales tax",
      tax_rate: "0",
      payment_terms_days: "30",
      quote_prefix: "QT-",
      invoice_prefix: "INV-",
      invoice_design: "classic",
      accent_color: "#073B4C",
      logo: { kind: "kept" },
      opening_balance_cents: "",
      opening_balance_on: "",
    });
  });

  it("sends the design, and the accent color in capitals", () => {
    const sent = toRequest({ ...FILLED, invoice_design: "ledger", accent_color: " #0e6b6b " });
    expect([sent.invoice_design, sent.accent_color]).toEqual(["ledger", "#0E6B6B"]);
  });

  it("sends no logo while it's kept, so its bytes aren't sent again", () => {
    expect("logo" in toRequest(FILLED)).toBe(false);
  });

  it("sends a new logo's bytes, and null for one removed", () => {
    const chosen = { kind: "new", name: "logo.png", base64: "iVBORw0KGgo=", url: "data:", size: null } as const;
    expect(toRequest({ ...FILLED, logo: chosen }).logo).toBe("iVBORw0KGgo=");
    expect(toRequest({ ...FILLED, logo: { kind: "removed" } }).logo).toBeNull();
  });

  it("checks the accent color with the rest", () => {
    expect(settingsProblems({ ...FILLED, accent_color: "#FFC145" }, TODAY, SAVED_ON).accent_color).toBe(
      "Too light to read on white. Choose a darker color",
    );
    expect(settingsProblems(FILLED, TODAY, SAVED_ON).accent_color).toBeUndefined();
  });
});

describe("the opening balance", () => {
  function problems(amount: string, on: string) {
    const found = settingsProblems(
      { ...FILLED, opening_balance_cents: amount, opening_balance_on: on },
      TODAY,
      SAVED_ON,
    );
    return { amount: found.opening_balance_cents, on: found.opening_balance_on };
  }

  it.each([
    ["40,000.00", "2025-12-01"],
    ["-4,250.00", "2025-12-01"],
    ["-$0.29", "2025-12-01"],
    ["0", TODAY],
    ["1,000,000,000,000.00", "2020-01-01"],
    ["-1000000000000", "2020-01-01"],
    ["", ""],
  ])("accepts %j as of %j", (amount, on) => {
    expect(problems(amount, on)).toEqual({ amount: undefined, on: undefined });
  });

  it.each([
    ["abc", OPENING_AMOUNT_MESSAGE],
    ["49.505", OPENING_AMOUNT_MESSAGE],
    ["--1", OPENING_AMOUNT_MESSAGE],
    ["1-", OPENING_AMOUNT_MESSAGE],
    ["1,000,000,000,000.01", OPENING_LIMIT_MESSAGE],
    ["-1,000,000,000,000.01", OPENING_LIMIT_MESSAGE],
    ["99999999999999999999", OPENING_LIMIT_MESSAGE],
  ])("refuses %j with its message", (amount, message) => {
    expect(problems(amount, "2025-12-01").amount).toBe(message);
  });

  it("needs its date with an amount, and its amount with a date", () => {
    expect(problems("40,000.00", "")).toEqual({ amount: undefined, on: OPENING_DATE_MESSAGE });
    expect(problems(" ", "2025-12-01")).toEqual({ amount: OPENING_AMOUNT_MISSING_MESSAGE, on: undefined });
  });

  it("takes a date of today and refuses tomorrow, against the page's today", () => {
    expect(problems("100", TODAY).on).toBeUndefined();
    expect(problems("100", "2026-11-06").on).toBe(OPENING_DATE_FUTURE_MESSAGE);
    expect(
      settingsProblems({ ...FILLED, opening_balance_on: "2026-11-06" }, "2026-11-06", SAVED_ON).opening_balance_on,
    ).toBe(undefined);
  });

  it("keeps a saved date that's after the page's today, as the backend does, but refuses a change to one", () => {
    // Saved while the computer's clock was a day ahead, and it's since been put right.
    const ahead = { ...FILLED, opening_balance_on: "2026-11-06" };
    expect(settingsProblems(ahead, TODAY, "2026-11-06").opening_balance_on).toBeUndefined();
    expect(settingsProblems(ahead, TODAY, SAVED_ON).opening_balance_on).toBe(OPENING_DATE_FUTURE_MESSAGE);
    expect(settingsProblems(ahead, TODAY, null).opening_balance_on).toBe(OPENING_DATE_FUTURE_MESSAGE);
  });

  it("sends whole cents, below zero too, and both as null when both are blank", () => {
    expect(toRequest(FILLED)).toMatchObject({ opening_balance_cents: 4_000_000, opening_balance_on: "2025-12-01" });
    expect(toRequest({ ...FILLED, opening_balance_cents: " -$1,250.50 " }).opening_balance_cents).toBe(-125050);
    const cleared = toRequest({ ...FILLED, opening_balance_cents: "", opening_balance_on: "" });
    expect([cleared.opening_balance_cents, cleared.opening_balance_on]).toEqual([null, null]);
  });

  it("fills the form with the saved amount as it's edited, below zero too", () => {
    const saved = { ...toRequest(FILLED), logo: null, updated_at: "2026-11-05T14:03:00Z", updated_by: null };
    expect(toForm({ ...saved, opening_balance_cents: -125050 })).toMatchObject({
      opening_balance_cents: "-1250.50",
      opening_balance_on: "2025-12-01",
    });
  });
});
