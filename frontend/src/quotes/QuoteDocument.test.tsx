import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";

import { QuoteDocument } from "./QuoteDocument";

const PLAINSONG = {
  name: "Plainsong Systems",
  address: "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
  email: "accounts@plainsong.example",
  phone: "(718) 555-0142",
};

const DOCUMENT: ComponentProps<typeof QuoteDocument> = {
  number: "QT-0004",
  draft: false,
  quoteDate: "2026-11-05",
  validUntil: "2026-12-05",
  company: PLAINSONG,
  preparedFor: { organization: "Harbor & Pine", contact: "Sam Carter", email: "sam.carter@harborpine.example" },
  taxLabel: "Sales tax",
  taxRate: "8.875",
  lines: [
    {
      key: 1,
      name: "Pro license",
      description: "Annual license, per seat",
      quantity: 12,
      unit_price_cents: 48000,
      amount_cents: 576000,
    },
    { key: 2, name: "Training day", description: null, quantity: 2, unit_price_cents: 125000, amount_cents: 250000 },
  ],
  figures: { subtotal_cents: 826000, tax_cents: 73308, total_cents: 899308 },
};

function show(changes: Partial<ComponentProps<typeof QuoteDocument>> = {}) {
  render(<QuoteDocument {...DOCUMENT} {...changes} />);
  return screen.getByRole("article", { name: "Preview" });
}

function texts(sheet: HTMLElement) {
  return [...sheet.querySelectorAll("p, span, dt, dd")].map((element) => element.textContent);
}

describe("the quote document", () => {
  it("shows the company, the quote's dates, Prepared for, the lines and the totals", () => {
    const sheet = show();
    const shown = sheet.textContent!;
    for (const part of [
      "Plainsong Systems",
      "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
      "accounts@plainsong.example",
      "(718) 555-0142",
      "NumberQT-0004",
      "DateNov 5, 2026",
      "Valid untilDec 5, 2026",
      "Prepared forHarbor & PineSam Cartersam.carter@harborpine.example",
      "ItemQtyUnit priceAmount",
      "Pro licenseAnnual license, per seat12$480.00$5,760.00",
      "Training day2$1,250.00$2,500.00",
      "Subtotal$8,260.00",
      "Sales tax (8.875%)$733.08",
      "Total$8,993.08",
    ]) {
      expect(shown).toContain(part);
    }
  });

  it("shows a blank tax label as Tax, with the rate as saved (Q17)", () => {
    expect(show({ taxLabel: null, taxRate: "8.5" }).textContent).toContain("Tax (8.5%)");
  });

  it("leaves out blank details, and Prepared for with nobody to prepare it for", () => {
    const sheet = show({
      company: { name: "Plainsong Systems", address: null, email: null, phone: "(718) 555-0142" },
      preparedFor: { organization: null, contact: null, email: null },
    });
    expect(texts(sheet).slice(0, 2)).toEqual(["Plainsong Systems", "(718) 555-0142"]);
    expect(sheet.textContent).not.toContain("Prepared for");
  });

  it("shows only the organization when the deal has no main contact", () => {
    const sheet = show({ preparedFor: { organization: "Harbor & Pine", contact: null, email: null } });
    expect(sheet.textContent).toContain("Prepared forHarbor & PineItem");
  });

  it("marks only a draft as a draft", () => {
    expect(within(show()).queryByText("Draft")).toBeNull();
  });

  it("marks a draft", () => {
    expect(within(show({ draft: true })).getByText("Draft")).toBeTruthy();
  });

  it("leaves out the number on a new draft, which has none yet", () => {
    expect(show({ number: null, draft: true }).textContent).not.toContain("Number");
  });

  it("shows typed text exactly as typed, never as markup (Q32)", () => {
    const typed = "<b>Rush</b> **bold**";
    const sheet = show({
      company: { ...PLAINSONG, name: typed },
      lines: [{ ...DOCUMENT.lines[0], description: `${typed}\nSecond line` }],
    });
    expect(sheet.querySelector("b")).toBeNull();
    expect(texts(sheet)).toContain(typed);
    expect(texts(sheet)).toContain(`${typed}\nSecond line`);
  });

  it("uses only the paper's colors, so dark mode leaves it as the customer sees it", () => {
    const sheet = show({ draft: true });
    const colors = [sheet, ...sheet.querySelectorAll("*")].flatMap((element) =>
      [...element.classList].filter(
        (name) => /^(bg|text)-(?!\[)/.test(name) && !/^text-(left|right|center)$/.test(name),
      ),
    );
    expect(colors.length).toBeGreaterThan(5); // The check is looking in the right place.
    expect(new Set(colors)).toEqual(
      new Set(["bg-paper", "text-paper-ink", "text-paper-muted", "bg-paper-band", "bg-sea-green"]),
    );
  });
});
