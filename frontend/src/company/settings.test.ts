import { describe, expect, it } from "vitest";

import cases from "../../../shared/settings-cases.json";
import {
  CLASH_MESSAGE,
  COMPANY_NAME_MESSAGE,
  INVOICE_PREFIX_BLANK_MESSAGE,
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
};

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
    expect(Object.values(settingsProblems(FILLED)).filter(Boolean)).toEqual([]);
  });

  it("gives every bad field its message at once", () => {
    const problems = settingsProblems({
      ...FILLED,
      company_name: " ",
      email: "accounts",
      tax_rate: "150",
      payment_terms_days: "400",
      quote_prefix: "QT_",
    });
    expect(problems).toMatchObject({
      company_name: COMPANY_NAME_MESSAGE,
      email: "Enter a valid email address",
      tax_rate: RATE_RANGE_MESSAGE,
      payment_terms_days: PAYMENT_TERMS_MESSAGE,
      quote_prefix: PREFIX_CHARACTERS_MESSAGE,
    });
  });

  it("puts a clash on the invoice prefix", () => {
    expect(settingsProblems({ ...FILLED, invoice_prefix: "qt-" }).invoice_prefix).toBe(CLASH_MESSAGE);
  });

  it("leaves the blank optional fields alone", () => {
    const problems = settingsProblems({ ...FILLED, address: "", email: "", phone: "", tax_label: "" });
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
    });
  });
});
